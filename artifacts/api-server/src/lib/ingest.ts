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
import { eq, and, count, desc, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { normalizeText, conditionRank } from "./normalize";
import { adapters, getAdapter } from "../adapters";
import type { NormalizedListing } from "../adapters";
import {
  evaluateMatch,
  type PreferenceCriteria,
  type ListingFacts,
} from "./matchEngine";
import { recomputeListingIntelligence, buildWhyNow } from "./intelligence";

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
 * Listing-level transition info detected during a single ingest cycle. Used by
 * the matcher to decide which alert types to emit (price_drop, back_in_stock,
 * better_condition, …) and to suppress alerts for listings that just went
 * unavailable.
 */
type ListingTransition = {
  isNew: boolean;
  prevPrice: number | null;
  newPrice: number;
  prevAvailability: string | null;
  newAvailability: string;
  prevConditionRank: number | null;
  newConditionRank: number | null;
};

/**
 * Run a single source adapter end-to-end:
 *   adapter.fetchListings → adapter.normalizeListing → adapter.validateListing
 *   → upsert in `listings` (by source_id + source_listing_id, no duplicates)
 *   → append `listing_snapshots` row
 *   → recompute intelligence (deal score, market range, scarcity)
 *   → match every upserted listing against active preferences (and emit alerts)
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
  const upsertedListings: { id: number; transition: ListingTransition }[] = [];

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
      const txResult = await db.transaction(async (tx) => {
        // Capture pre-upsert state for transition detection.
        const [prior] = await tx
          .select({
            id: listingsTable.id,
            price: listingsTable.price,
            availabilityStatus: listingsTable.availabilityStatus,
            normalizedCondition: listingsTable.normalizedCondition,
          })
          .from(listingsTable)
          .where(
            and(
              eq(listingsTable.sourceId, source.id),
              eq(listingsTable.sourceListingId, normalized.sourceListingId),
            ),
          );

        const prevPrice = prior ? parseFloat(prior.price) : null;
        const prevAvailability = prior?.availabilityStatus ?? null;
        const prevConditionRank = prior?.normalizedCondition
          ? conditionRank(prior.normalizedCondition)
          : null;

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
              condition: normalized.condition,
              normalizedCondition: normalized.normalizedCondition,
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

        const transition: ListingTransition = {
          isNew: !!newRow,
          prevPrice,
          newPrice: normalized.price,
          prevAvailability,
          newAvailability: normalized.availabilityStatus,
          prevConditionRank,
          newConditionRank: normalized.normalizedCondition
            ? conditionRank(normalized.normalizedCondition)
            : null,
        };

        return { listingId: row.id, transition };
      });

      if (txResult.transition.isNew) {
        added++;
      } else {
        updated++;
      }
      upsertedListings.push({ id: txResult.listingId, transition: txResult.transition });
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

  // Recompute intelligence for every upserted listing first (so the matcher
  // sees fresh deal scores / scarcity tiers) and then run match + alert flow.
  for (const u of upsertedListings) {
    try {
      await recomputeListingIntelligence(u.id);
    } catch (err) {
      logger.error({ err, listingId: u.id }, "Intelligence recompute error");
    }
  }

  for (const u of upsertedListings) {
    try {
      await matchListingAgainstAllPreferences(u.id, u.transition);
    } catch (err) {
      logger.error({ err, listingId: u.id }, "Match engine error");
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
 * Score one listing against all active preferences and persist any matches
 * the engine deems eligible (matchType ∈ exact, strong, close).
 *
 * Also emits alerts:
 *   - new_match           (first time we surface this listing for a pref)
 *   - exact_model         (engine flagged matchType === "exact")
 *   - under_target_price  (price <= preference.maxPrice * 0.85)
 *   - price_drop          (>= 5% drop vs prior snapshot)
 *   - back_in_stock       (transitioned from sold/reserved → available)
 *   - better_condition    (rank improved, i.e. lower number)
 *
 * Dedup rule: skip a (user, listing, type) alert if a prior alert of that
 * type exists within the last 24h *and* the relevant facts haven't materially
 * changed since that alert was created.
 *
 * If a listing transitions to unavailable, no new alerts are emitted and any
 * existing pending alerts for the listing are dismissed.
 */
export async function matchListingAgainstAllPreferences(
  listingId: number,
  transition?: ListingTransition,
) {
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) return;

  // If listing has gone unavailable, dismiss any pending alerts and stop.
  const isAvailable = listing.availabilityStatus === "available";
  if (!isAvailable) {
    await db
      .update(alertsTable)
      .set({ status: "dismissed" })
      .where(
        and(
          eq(alertsTable.listingId, listing.id),
          inArray(alertsTable.status, ["pending", "sent"]),
        ),
      );
    return;
  }

  const prefs = await db
    .select()
    .from(bagPreferencesTable)
    .where(eq(bagPreferencesTable.active, true));
  if (prefs.length === 0) return;

  // Resolve listing facts once: condition rank + color family.
  const listingColorFamily = listing.normalizedColor
    ? (
        await db
          .select({ family: colorsTable.family })
          .from(colorsTable)
          .where(eq(colorsTable.normalizedName, listing.normalizedColor))
      )[0]?.family ?? null
    : null;

  const facts: ListingFacts = {
    brand: listing.brand,
    model: listing.model,
    style: listing.style,
    condition: listing.condition,
    color: listing.color,
    size: listing.size,
    title: listing.title,
    price: parseFloat(listing.price),
    currency: listing.currency,
    normalizedBrand: listing.normalizedBrand,
    normalizedModel: listing.normalizedModel,
    normalizedStyle: listing.normalizedStyle,
    normalizedCondition: listing.normalizedCondition,
    normalizedColor: listing.normalizedColor,
    normalizedSize: listing.size ? normalizeText(listing.size) : null,
    conditionRank: listing.condition ? conditionRank(listing.condition) : null,
    colorFamily: listingColorFamily,
  };

  const priceDropPercent =
    transition && transition.prevPrice && transition.prevPrice > 0
      ? ((transition.prevPrice - transition.newPrice) / transition.prevPrice) * 100
      : null;
  const isPriceDrop = priceDropPercent != null && priceDropPercent >= 5;
  const isBackInStock =
    transition?.prevAvailability != null &&
    transition.prevAvailability !== "available" &&
    transition.newAvailability === "available";
  const isBetterCondition =
    transition?.prevConditionRank != null &&
    transition.newConditionRank != null &&
    transition.newConditionRank < transition.prevConditionRank;

  for (const pref of prefs) {
    const criteria = await loadPreferenceCriteria(pref);
    const result = evaluateMatch(criteria, facts);

    // Don't persist weak / rejected matches — they're noise.
    if (!result.alertEligible) continue;

    const [match] = await db
      .insert(matchResultsTable)
      .values({
        userId: pref.userId,
        preferenceId: pref.id,
        listingId: listing.id,
        // Engine emits 0–100; column stores 0–1 fractional so existing UI
        // (which renders `Math.round(score * 100)`) keeps working.
        matchScore: (result.matchScore / 100).toFixed(3),
        matchType: result.matchType,
        matchExplanation: result.explanation,
        alertEligible: result.alertEligible,
        matchReasons: result.matchReasons,
        disqualifiers: result.disqualifiers,
      })
      .onConflictDoUpdate({
        target: [matchResultsTable.preferenceId, matchResultsTable.listingId],
        set: {
          matchScore: (result.matchScore / 100).toFixed(3),
          matchType: result.matchType,
          matchExplanation: result.explanation,
          alertEligible: result.alertEligible,
          matchReasons: result.matchReasons,
          disqualifiers: result.disqualifiers,
        },
      })
      .returning();

    // Build the candidate alert types for this (user, listing) pair.
    const candidates: {
      type: string;
      whyNow: string;
      message: string;
    }[] = [];

    candidates.push({
      type: "new_match",
      whyNow: buildWhyNow({
        alertType: "new_match",
        matchType: result.matchType,
        scarcityTier: listing.scarcityTier,
        priceVerdict: listing.priceVerdict,
        isNewListing: transition?.isNew ?? false,
      }),
      message: result.explanation,
    });

    if (result.matchType === "exact") {
      candidates.push({
        type: "exact_model",
        whyNow: buildWhyNow({ alertType: "exact_model", isExactModel: true }),
        message: `Exact match for ${pref.nickname}: ${result.explanation}`,
      });
    }

    const maxPrice = pref.maxPrice ? parseFloat(pref.maxPrice) : null;
    if (maxPrice && facts.price <= maxPrice * 0.85) {
      const underBy = maxPrice - facts.price;
      candidates.push({
        type: "under_target_price",
        whyNow: buildWhyNow({
          alertType: "under_target_price",
          underTargetBy: underBy,
        }),
        message: `Under your ${pref.nickname} target by $${Math.round(underBy).toLocaleString()}`,
      });
    }

    if (isPriceDrop) {
      candidates.push({
        type: "price_drop",
        whyNow: buildWhyNow({
          alertType: "price_drop",
          priceDropPercent,
        }),
        message: `Price dropped ${Math.round(priceDropPercent!)}% on this ${pref.nickname} match.`,
      });
    }

    if (isBackInStock) {
      candidates.push({
        type: "back_in_stock",
        whyNow: buildWhyNow({ alertType: "back_in_stock" }),
        message: `This listing is available again.`,
      });
    }

    if (isBetterCondition) {
      candidates.push({
        type: "better_condition",
        whyNow: buildWhyNow({ alertType: "better_condition" }),
        message: `Listing condition improved.`,
      });
    }

    for (const c of candidates) {
      const shouldEmit = await shouldEmitAlert({
        userId: pref.userId,
        listingId: listing.id,
        alertType: c.type,
        currentPrice: facts.price,
        currentConditionRank: facts.conditionRank,
      });
      if (!shouldEmit) continue;

      await db.insert(alertsTable).values({
        userId: pref.userId,
        preferenceId: pref.id,
        listingId: listing.id,
        matchResultId: match.id,
        alertType: c.type,
        status: "pending",
        message: c.message,
        whyNow: c.whyNow,
        priceAtAlert: String(facts.price),
        conditionRankAtAlert: facts.conditionRank,
        availabilityAtAlert: listing.availabilityStatus,
      });
    }
  }
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Allow re-emitting an alert of the same type only if either:
 *   - 24h have passed since the most recent alert of that type, OR
 *   - facts have materially changed since that alert (>=5% price delta or
 *     condition rank improved). Otherwise suppress as a duplicate.
 */
async function shouldEmitAlert(opts: {
  userId: string;
  listingId: number;
  alertType: string;
  currentPrice: number;
  currentConditionRank: number | null;
}): Promise<boolean> {
  const [last] = await db
    .select()
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.userId, opts.userId),
        eq(alertsTable.listingId, opts.listingId),
        eq(alertsTable.alertType, opts.alertType),
      ),
    )
    .orderBy(desc(alertsTable.createdAt))
    .limit(1);

  if (!last) return true;

  const ageMs = Date.now() - last.createdAt.getTime();
  if (ageMs >= COOLDOWN_MS) return true;

  const priceAtAlert = last.priceAtAlert ? parseFloat(last.priceAtAlert) : null;
  const materialPriceChange =
    priceAtAlert != null &&
    priceAtAlert > 0 &&
    Math.abs(priceAtAlert - opts.currentPrice) / priceAtAlert >= 0.05;
  const materialConditionChange =
    last.conditionRankAtAlert != null &&
    opts.currentConditionRank != null &&
    opts.currentConditionRank < last.conditionRankAtAlert;

  return materialPriceChange || materialConditionChange;
}

/**
 * Load every reference row a preference points at and shape it into the
 * pure-function input the match engine expects.
 */
async function loadPreferenceCriteria(
  pref: typeof bagPreferencesTable.$inferSelect,
): Promise<PreferenceCriteria> {
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

  return {
    nickname: pref.nickname,
    onlyExactCriteria: pref.onlyExactCriteria,
    exactModelEnabled: pref.exactModelEnabled,
    allowCloseMatches: pref.allowCloseMatches,
    allowCloseColorMatch: pref.allowCloseColorMatch,
    modelQuery: pref.modelQuery,
    minPrice: pref.minPrice ? parseFloat(pref.minPrice) : null,
    maxPrice: pref.maxPrice ? parseFloat(pref.maxPrice) : null,
    conditionMinRank: condMin[0]?.rank ?? null,
    conditionMinName: condMin[0]?.name ?? null,
    brands: brands.map((b) => b.b.normalizedName),
    styles: styles.map((s) => s.s.normalizedName),
    colors: colors.map((c) => c.c.normalizedName),
    sizes: sizes.map((s) => s.s.normalizedName),
    colorFamilies: Array.from(
      new Set(colors.map((c) => c.c.family).filter((f): f is string => Boolean(f))),
    ),
  };
}

/**
 * Run every registered active adapter once. Used by manual "ingest all"
 * triggers and the auto-seed startup hook.
 *
 * Each adapter is wrapped in its own try/catch so one source throwing
 * never aborts the rest of the run. `runMockIngest` already records its
 * own internal errors into `ingestion_logs`; the outer try/catch here is
 * a final safety net for unexpected throws (network stack failures,
 * DB transaction errors that escape the inner handler, etc.).
 */
export async function runAllIngests(): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const adapter of adapters) {
    try {
      results.push(await runMockIngest(adapter.sourceSlug));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, sourceSlug: adapter.sourceSlug },
        "runAllIngests: adapter run threw, continuing with next source",
      );
      results.push({
        sourceSlug: adapter.sourceSlug,
        listingsFound: 0,
        listingsAdded: 0,
        listingsUpdated: 0,
        listingsRejected: 0,
        durationMs: 0,
        errors: [`Adapter run threw: ${msg}`],
      });
    }
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
