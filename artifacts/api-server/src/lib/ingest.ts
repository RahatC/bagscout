import {
  db,
  sourcesTable,
  listingsTable,
  listingSnapshotsTable,
  ingestionLogsTable,
  bagPreferencesTable,
  bagPreferenceBrandsTable,
  bagPreferenceStylesTable,
  bagPreferenceColorsTable,
  bagPreferenceSizesTable,
  brandsTable,
  bagStylesTable,
  colorsTable,
  sizesTable,
  conditionsTable,
  matchResultsTable,
  alertsTable,
  type MatchReason,
  type Disqualifier,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "./logger";
import { normalizeText, conditionRank } from "./normalize";
import { adapters, getAdapter } from "../adapters";
import type { NormalizedListing } from "../adapters";

export type IngestResult = {
  sourceSlug: string;
  listingsFound: number;
  listingsAdded: number;
  listingsUpdated: number;
  listingsRejected: number;
  durationMs: number;
  errors: string[];
};

/**
 * Run a single source adapter end-to-end:
 *   adapter.fetchListings → adapter.normalizeListing → adapter.validateListing
 *   → upsert in `listings` (by source_id + source_listing_id, no duplicates)
 *   → append `listing_snapshots` row
 *   → match every upserted listing against active preferences
 *   → write `ingestion_logs` open + close rows
 */
export async function runMockIngest(sourceSlug: string): Promise<IngestResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  const adapter = getAdapter(sourceSlug);
  if (!adapter) {
    return {
      sourceSlug,
      listingsFound: 0,
      listingsAdded: 0,
      listingsUpdated: 0,
      listingsRejected: 0,
      durationMs: Date.now() - startTime,
      errors: [`No adapter registered for sourceSlug "${sourceSlug}"`],
    };
  }

  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.slug, sourceSlug));

  if (!source) {
    return {
      sourceSlug,
      listingsFound: 0,
      listingsAdded: 0,
      listingsUpdated: 0,
      listingsRejected: 0,
      durationMs: Date.now() - startTime,
      errors: [`Source row not found in DB for slug "${sourceSlug}"`],
    };
  }

  // Open ingestion log
  const [log] = await db
    .insert(ingestionLogsTable)
    .values({
      sourceId: source.id,
      jobType: "manual",
      status: "running",
      recordsSeen: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
    })
    .returning();

  let raws;
  try {
    raws = await adapter.fetchListings();
  } catch (err) {
    const msg = `Adapter fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(msg);
    logger.error({ err, sourceSlug }, "Adapter fetch failed");
    await db
      .update(ingestionLogsTable)
      .set({
        status: "failed",
        errorMessage: msg.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(ingestionLogsTable.id, log.id));
    return {
      sourceSlug,
      listingsFound: 0,
      listingsAdded: 0,
      listingsUpdated: 0,
      listingsRejected: 0,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  let added = 0;
  let updated = 0;
  let rejected = 0;
  const upsertedListingIds: number[] = [];

  for (const raw of raws) {
    let normalized: NormalizedListing;
    try {
      normalized = adapter.normalizeListing(raw);
    } catch (err) {
      rejected++;
      errors.push(`Normalize failed for ${raw.externalId}: ${err}`);
      logger.error({ err, externalId: raw.externalId }, "Normalize error");
      continue;
    }

    const validation = adapter.validateListing(normalized);
    if (!validation.valid) {
      rejected++;
      errors.push(`Invalid listing ${raw.externalId}: ${validation.errors.join(", ")}`);
      continue;
    }

    try {
      // Atomic upsert + snapshot in a single transaction so a snapshot failure
      // rolls back the listing write and we never end up with a listing that
      // has no price-history row.
      const { listingId, isNew } = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(listingsTable)
          .values({
            sourceId: source.id,
            sourceListingId: normalized.sourceListingId,
            sourceUrl: normalized.sourceUrl,
            title: normalized.title,
            brand: normalized.brand,
            model: normalized.model,
            style: normalized.style,
            condition: normalized.condition,
            color: normalized.color,
            size: normalized.size,
            normalizedBrand: normalized.normalizedBrand,
            normalizedModel: normalized.normalizedModel,
            normalizedStyle: normalized.normalizedStyle,
            normalizedCondition: normalized.normalizedCondition,
            normalizedColor: normalized.normalizedColor,
            price: String(normalized.price),
            originalPrice:
              normalized.originalPrice != null ? String(normalized.originalPrice) : null,
            discountPercent:
              normalized.discountPercent != null ? String(normalized.discountPercent) : null,
            currency: normalized.currency,
            imageUrl: normalized.imageUrl,
            description: normalized.description,
            availabilityStatus: normalized.availabilityStatus,
          })
          .onConflictDoUpdate({
            target: [listingsTable.sourceId, listingsTable.sourceListingId],
            set: {
              price: String(normalized.price),
              originalPrice:
                normalized.originalPrice != null ? String(normalized.originalPrice) : null,
              discountPercent:
                normalized.discountPercent != null ? String(normalized.discountPercent) : null,
              availabilityStatus: normalized.availabilityStatus,
              lastSeenAt: new Date(),
            },
          })
          .returning({
            id: listingsTable.id,
            createdAt: listingsTable.createdAt,
            updatedAt: listingsTable.updatedAt,
          });

        // Postgres uses the same value for created_at / updated_at on a fresh
        // insert, but updated_at is bumped on conflict via $onUpdate(). Treat
        // any row whose timestamps are still equal as "new".
        const newRow =
          row.createdAt &&
          row.updatedAt &&
          row.createdAt.getTime() === row.updatedAt.getTime();

        await tx.insert(listingSnapshotsTable).values({
          listingId: row.id,
          price: String(normalized.price),
          availabilityStatus: normalized.availabilityStatus,
        });

        return { listingId: row.id, isNew: !!newRow };
      });

      if (isNew) {
        added++;
      } else {
        updated++;
      }
      upsertedListingIds.push(listingId);
    } catch (err) {
      errors.push(`Failed to upsert ${raw.externalId}: ${err}`);
      logger.error({ err, externalId: raw.externalId }, "Ingest upsert error");
    }
  }

  // Update source metadata
  const [{ value: totalForSource }] = await db
    .select({ value: count(listingsTable.id) })
    .from(listingsTable)
    .where(eq(listingsTable.sourceId, source.id));

  await db
    .update(sourcesTable)
    .set({
      lastIngestAt: new Date(),
      status: errors.length === 0 ? "healthy" : "degraded",
      listingCount: totalForSource,
    })
    .where(eq(sourcesTable.id, source.id));

  // Close ingestion log
  const finalStatus =
    errors.length === 0
      ? "success"
      : added + updated === 0
        ? "failed"
        : "partial";
  await db
    .update(ingestionLogsTable)
    .set({
      status: finalStatus,
      recordsSeen: raws.length,
      recordsCreated: added,
      recordsUpdated: updated,
      errorMessage: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      completedAt: new Date(),
    })
    .where(eq(ingestionLogsTable.id, log.id));

  // Run matching engine for each upserted listing
  for (const listingId of upsertedListingIds) {
    try {
      await matchListingAgainstAllPreferences(listingId);
    } catch (err) {
      logger.error({ err, listingId }, "Match engine error");
    }
  }

  return {
    sourceSlug,
    listingsFound: raws.length,
    listingsAdded: added,
    listingsUpdated: updated,
    listingsRejected: rejected,
    durationMs: Date.now() - startTime,
    errors,
  };
}

/**
 * Score one listing against all active preferences and persist any matches above threshold.
 */
export async function matchListingAgainstAllPreferences(listingId: number) {
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) return;

  const prefs = await db
    .select()
    .from(bagPreferencesTable)
    .where(eq(bagPreferencesTable.active, true));

  for (const pref of prefs) {
    const result = await scorePreferenceAgainstListing(pref, listing);
    if (!result) continue;

    const threshold = pref.onlyExactCriteria ? 0.99 : pref.allowCloseMatches ? 0.65 : 0.85;
    if (result.score < threshold) continue;

    const [match] = await db
      .insert(matchResultsTable)
      .values({
        userId: pref.userId,
        preferenceId: pref.id,
        listingId: listing.id,
        matchScore: result.score.toFixed(3),
        matchType: result.score >= 0.85 ? "exact" : "close",
        matchReasons: result.reasons,
        disqualifiers: result.disqualifiers,
      })
      .onConflictDoUpdate({
        target: [matchResultsTable.preferenceId, matchResultsTable.listingId],
        set: {
          matchScore: result.score.toFixed(3),
          matchReasons: result.reasons,
          disqualifiers: result.disqualifiers,
        },
      })
      .returning();

    const existingAlert = await db
      .select()
      .from(alertsTable)
      .where(
        and(
          eq(alertsTable.userId, pref.userId),
          eq(alertsTable.listingId, listing.id),
          eq(alertsTable.alertType, "new_match"),
        ),
      );
    if (existingAlert.length === 0) {
      await db.insert(alertsTable).values({
        userId: pref.userId,
        preferenceId: pref.id,
        listingId: listing.id,
        matchResultId: match.id,
        alertType: "new_match",
        status: "pending",
        message: `${listing.brand} ${listing.model ?? ""} matched "${pref.nickname}"`,
      });
    }
  }
}

async function scorePreferenceAgainstListing(
  pref: typeof bagPreferencesTable.$inferSelect,
  listing: typeof listingsTable.$inferSelect,
): Promise<{ score: number; reasons: MatchReason[]; disqualifiers: Disqualifier[] } | null> {
  const reasons: MatchReason[] = [];
  const disqualifiers: Disqualifier[] = [];

  const [brands, styles, colors, sizes, condMin] = await Promise.all([
    db
      .select({ b: brandsTable })
      .from(bagPreferenceBrandsTable)
      .innerJoin(brandsTable, eq(bagPreferenceBrandsTable.brandId, brandsTable.id))
      .where(eq(bagPreferenceBrandsTable.preferenceId, pref.id)),
    db
      .select({ s: bagStylesTable })
      .from(bagPreferenceStylesTable)
      .innerJoin(bagStylesTable, eq(bagPreferenceStylesTable.styleId, bagStylesTable.id))
      .where(eq(bagPreferenceStylesTable.preferenceId, pref.id)),
    db
      .select({ c: colorsTable })
      .from(bagPreferenceColorsTable)
      .innerJoin(colorsTable, eq(bagPreferenceColorsTable.colorId, colorsTable.id))
      .where(eq(bagPreferenceColorsTable.preferenceId, pref.id)),
    db
      .select({ s: sizesTable })
      .from(bagPreferenceSizesTable)
      .innerJoin(sizesTable, eq(bagPreferenceSizesTable.sizeId, sizesTable.id))
      .where(eq(bagPreferenceSizesTable.preferenceId, pref.id)),
    pref.conditionMinId
      ? db.select().from(conditionsTable).where(eq(conditionsTable.id, pref.conditionMinId))
      : Promise.resolve([]),
  ]);

  if (brands.length === 0) return null;

  const W_BRAND = 0.28;
  const W_MODEL = 0.18;
  const W_STYLE = 0.1;
  const W_COLOR = 0.13;
  const W_SIZE = 0.08;
  const W_CONDITION = 0.1;
  const W_PRICE = 0.13;

  let score = 0;

  const brandMatch = brands.find((b) => b.b.normalizedName === listing.normalizedBrand);
  if (brandMatch) {
    score += W_BRAND;
    reasons.push({ field: "brand", value: brandMatch.b.name, matched: true, weight: W_BRAND });
  } else {
    disqualifiers.push({
      field: "brand",
      value: listing.brand,
      reason: "Brand not in preference list",
    });
    return { score: 0, reasons, disqualifiers };
  }

  if (pref.exactModelEnabled && pref.modelQuery) {
    const q = normalizeText(pref.modelQuery);
    const haystack = `${listing.normalizedModel ?? ""} ${normalizeText(listing.title)}`;
    if (haystack.includes(q)) {
      score += W_MODEL;
      reasons.push({ field: "model", value: pref.modelQuery, matched: true, weight: W_MODEL });
    } else {
      disqualifiers.push({
        field: "model",
        value: listing.model ?? "(none)",
        reason: `Does not contain "${pref.modelQuery}"`,
      });
    }
  } else {
    score += W_MODEL;
  }

  if (styles.length > 0) {
    const m = styles.find((s) => s.s.normalizedName === listing.normalizedStyle);
    if (m) {
      score += W_STYLE;
      reasons.push({ field: "style", value: m.s.name, matched: true, weight: W_STYLE });
    } else {
      disqualifiers.push({
        field: "style",
        value: listing.style ?? "(none)",
        reason: "Style not in preference list",
      });
    }
  } else {
    score += W_STYLE;
  }

  if (colors.length > 0) {
    const exact = colors.find((c) => c.c.normalizedName === listing.normalizedColor);
    if (exact) {
      score += W_COLOR;
      reasons.push({ field: "color", value: exact.c.name, matched: true, weight: W_COLOR });
    } else if (pref.allowCloseColorMatch) {
      const preferredFamilies = new Set(
        colors.map((c) => c.c.family).filter((f): f is string => Boolean(f)),
      );
      let listingFamily: string | null = null;
      if (listing.normalizedColor) {
        const [listingColor] = await db
          .select()
          .from(colorsTable)
          .where(eq(colorsTable.normalizedName, listing.normalizedColor));
        listingFamily = listingColor?.family ?? null;
      }
      if (listingFamily && preferredFamilies.has(listingFamily)) {
        score += W_COLOR * 0.5;
        reasons.push({
          field: "color",
          value: listing.color ?? "(close family)",
          matched: true,
          weight: W_COLOR * 0.5,
          detail: `Close color family match (${listingFamily})`,
        });
      } else {
        disqualifiers.push({
          field: "color",
          value: listing.color ?? "(none)",
          reason: "Color family not in preference",
        });
      }
    } else {
      disqualifiers.push({
        field: "color",
        value: listing.color ?? "(none)",
        reason: "Color not in preference (close match disabled)",
      });
    }
  } else {
    score += W_COLOR;
  }

  if (sizes.length > 0) {
    const m = sizes.find((s) => s.s.normalizedName === listing.size?.toLowerCase().trim());
    if (m) {
      score += W_SIZE;
      reasons.push({ field: "size", value: m.s.name, matched: true, weight: W_SIZE });
    } else {
      disqualifiers.push({
        field: "size",
        value: listing.size ?? "(none)",
        reason: "Size not in preference list",
      });
    }
  } else {
    score += W_SIZE;
  }

  if (condMin[0]) {
    const listingRank = conditionRank(listing.condition);
    if (listingRank <= condMin[0].rank) {
      score += W_CONDITION;
      reasons.push({
        field: "condition",
        value: listing.condition ?? "",
        matched: true,
        weight: W_CONDITION,
      });
    } else {
      disqualifiers.push({
        field: "condition",
        value: listing.condition ?? "(unknown)",
        reason: `Below minimum (${condMin[0].name})`,
      });
    }
  } else {
    score += W_CONDITION;
  }

  const price = parseFloat(listing.price);
  const min = pref.minPrice ? parseFloat(pref.minPrice) : null;
  const max = pref.maxPrice ? parseFloat(pref.maxPrice) : null;
  if ((min == null || price >= min) && (max == null || price <= max)) {
    score += W_PRICE;
    reasons.push({
      field: "price",
      value: `$${price.toLocaleString()}`,
      matched: true,
      weight: W_PRICE,
    });
  } else {
    disqualifiers.push({
      field: "price",
      value: `$${price.toLocaleString()}`,
      reason: `Outside ${min ?? "0"} – ${max ?? "∞"} range`,
    });
  }

  return { score, reasons, disqualifiers };
}

/**
 * Run every registered active adapter once. Used by manual "ingest all"
 * triggers and the auto-seed startup hook.
 */
export async function runAllIngests(): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const adapter of adapters) {
    results.push(await runMockIngest(adapter.sourceSlug));
  }
  return results;
}

/**
 * If the listings table is empty, run every adapter once to populate the DB.
 * Safe to call on every server startup — it's a no-op once data exists.
 */
export async function autoSeedIfEmpty(): Promise<void> {
  const [{ value }] = await db.select({ value: count(listingsTable.id) }).from(listingsTable);
  if (value > 0) {
    logger.info({ existingListings: value }, "Listings already present, skipping auto-seed");
    return;
  }
  logger.info("Listings table empty — running all source adapters once");
  const results = await runAllIngests();
  for (const r of results) {
    logger.info(
      {
        source: r.sourceSlug,
        added: r.listingsAdded,
        updated: r.listingsUpdated,
        rejected: r.listingsRejected,
        errors: r.errors.length,
      },
      "Auto-seed source complete",
    );
  }
}
