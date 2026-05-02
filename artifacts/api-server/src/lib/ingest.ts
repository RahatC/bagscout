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
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { normalizeText, conditionRank } from "./normalize";

type MockListing = {
  externalId: string;
  title: string;
  brand: string;
  model: string;
  style: string;
  color: string;
  size: string;
  condition: string;
  price: number;
  originalPrice?: number;
  imageUrl: string;
  description: string;
};

const MOCK: Record<string, MockListing[]> = {
  fashionphile: [
    { externalId: "fp-001", title: "Hermès Birkin 30 Etoupe Togo PHW", brand: "Hermès", model: "Birkin", style: "Top Handle", color: "Beige", size: "Birkin 30", condition: "Excellent", price: 18500, originalPrice: 21000, imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800", description: "Hermès Birkin 30 in Etoupe Togo leather with Palladium hardware. Near mint condition." },
    { externalId: "fp-002", title: "Chanel Medium Classic Flap Black Caviar GHW", brand: "Chanel", model: "Classic Flap", style: "Shoulder Bag", color: "Black", size: "Medium", condition: "Very Good", price: 8200, originalPrice: 9000, imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800", description: "Chanel Medium Classic Flap in Black Caviar leather with Gold hardware." },
    { externalId: "fp-003", title: "Louis Vuitton Neverfull MM Damier Ebene", brand: "Louis Vuitton", model: "Neverfull", style: "Tote", color: "Brown", size: "MM", condition: "Good", price: 1250, imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800", description: "Louis Vuitton Neverfull MM in Damier Ebene canvas." },
  ],
  rebag: [
    { externalId: "rb-001", title: "Hermès Kelly 28 Sellier Gold Epsom GHW", brand: "Hermès", model: "Kelly", style: "Top Handle", color: "Gold", size: "Kelly 28", condition: "Excellent", price: 22000, imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800", description: "Hermès Kelly 28 Sellier in Gold Epsom leather with Gold hardware." },
    { externalId: "rb-002", title: "Bottega Veneta Jodie Parakeet Medium", brand: "Bottega Veneta", model: "Jodie", style: "Hobo", color: "Green", size: "Medium", condition: "Very Good", price: 1850, originalPrice: 2200, imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800", description: "Bottega Veneta Jodie in Parakeet Intrecciato leather." },
    { externalId: "rb-003", title: "Gucci Dionysus Small Beige GG Supreme", brand: "Gucci", model: "Dionysus", style: "Shoulder Bag", color: "Beige", size: "Small", condition: "Good", price: 980, originalPrice: 1400, imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4b4f7a?w=800", description: "Gucci Dionysus Small Shoulder Bag in Beige GG Supreme canvas." },
  ],
  therealreal: [
    { externalId: "trr-001", title: "Chanel Boy Bag Medium Navy Lambskin", brand: "Chanel", model: "Boy Bag", style: "Shoulder Bag", color: "Navy", size: "Medium", condition: "Excellent", price: 5800, originalPrice: 6500, imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800", description: "Chanel Boy Bag in Navy Blue Lambskin leather with Silver hardware." },
    { externalId: "trr-002", title: "Prada Galleria Medium Saffiano Black", brand: "Prada", model: "Galleria", style: "Top Handle", color: "Black", size: "Medium", condition: "Very Good", price: 1650, imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4b4f7a?w=800", description: "Prada Galleria in Black Saffiano leather. Clean interior." },
    { externalId: "trr-003", title: "Celine Micro Luggage Caramel", brand: "Celine", model: "Luggage", style: "Top Handle", color: "Brown", size: "Mini", condition: "Good", price: 1200, originalPrice: 1600, imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800", description: "Celine Micro Luggage in Caramel Smooth Leather." },
  ],
  yoogiscloset: [
    { externalId: "yc-001", title: "Hermès Birkin 35 Black Togo GHW", brand: "Hermès", model: "Birkin", style: "Top Handle", color: "Black", size: "Birkin 35", condition: "Very Good", price: 16800, imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800", description: "Hermès Birkin 35 in Black Togo leather with Gold hardware." },
    { externalId: "yc-002", title: "Louis Vuitton Speedy Bandouliere 30 Monogram", brand: "Louis Vuitton", model: "Speedy", style: "Top Handle", color: "Brown", size: "Medium", condition: "Good", price: 780, originalPrice: 1050, imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800", description: "Louis Vuitton Speedy Bandouliere 30 in Monogram canvas with strap." },
    { externalId: "yc-003", title: "Fendi Baguette Blush Pink Zucca", brand: "Fendi", model: "Baguette", style: "Shoulder Bag", color: "Pink", size: "Small", condition: "Excellent", price: 2200, originalPrice: 2800, imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4b4f7a?w=800", description: "Fendi Baguette in Blush Pink Zucca FF jacquard with silver hardware." },
  ],
};

export async function runMockIngest(sourceSlug: string) {
  const startTime = Date.now();
  const errors: string[] = [];

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
      durationMs: Date.now() - startTime,
      errors: [`Source "${sourceSlug}" not found`],
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

  const items = MOCK[sourceSlug] ?? [];
  let added = 0;
  let updated = 0;
  const upsertedListingIds: number[] = [];

  for (const item of items) {
    try {
      const discountPercent =
        item.originalPrice && item.originalPrice > item.price
          ? ((item.originalPrice - item.price) / item.originalPrice) * 100
          : null;

      const sourceUrl = `${source.baseUrl}/listing/${item.externalId}`;

      const existing = await db
        .select()
        .from(listingsTable)
        .where(
          and(
            eq(listingsTable.sourceId, source.id),
            eq(listingsTable.sourceListingId, item.externalId),
          ),
        );

      let listingId: number;
      if (existing.length > 0) {
        const [u] = await db
          .update(listingsTable)
          .set({
            price: String(item.price),
            originalPrice: item.originalPrice ? String(item.originalPrice) : null,
            discountPercent: discountPercent != null ? String(discountPercent.toFixed(2)) : null,
            availabilityStatus: "available",
            lastSeenAt: new Date(),
          })
          .where(eq(listingsTable.id, existing[0].id))
          .returning();
        listingId = u.id;
        updated++;
      } else {
        const [u] = await db
          .insert(listingsTable)
          .values({
            sourceId: source.id,
            sourceListingId: item.externalId,
            sourceUrl,
            title: item.title,
            brand: item.brand,
            model: item.model,
            style: item.style,
            condition: item.condition,
            color: item.color,
            size: item.size,
            normalizedBrand: normalizeText(item.brand),
            normalizedModel: normalizeText(item.model),
            normalizedStyle: normalizeText(item.style),
            normalizedCondition: normalizeText(item.condition),
            normalizedColor: normalizeText(item.color),
            price: String(item.price),
            originalPrice: item.originalPrice ? String(item.originalPrice) : null,
            discountPercent: discountPercent != null ? String(discountPercent.toFixed(2)) : null,
            currency: "USD",
            imageUrl: item.imageUrl,
            description: item.description,
            availabilityStatus: "available",
          })
          .returning();
        listingId = u.id;
        added++;
      }

      // Append snapshot
      await db.insert(listingSnapshotsTable).values({
        listingId,
        price: String(item.price),
        availabilityStatus: "available",
      });

      upsertedListingIds.push(listingId);
    } catch (err) {
      errors.push(`Failed to upsert ${item.externalId}: ${err}`);
      logger.error({ err, externalId: item.externalId }, "Ingest error");
    }
  }

  // Update source metadata
  await db
    .update(sourcesTable)
    .set({
      lastIngestAt: new Date(),
      status: errors.length === 0 ? "healthy" : "degraded",
      listingCount: items.length,
    })
    .where(eq(sourcesTable.id, source.id));

  // Close ingestion log
  await db
    .update(ingestionLogsTable)
    .set({
      status: errors.length === 0 ? "success" : errors.length === items.length ? "failed" : "partial",
      recordsSeen: items.length,
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
    listingsFound: items.length,
    listingsAdded: added,
    listingsUpdated: updated,
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

    // Upsert match_result
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

    // Create alert if not already
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

  // Load preference junction data + min condition
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

  // Brand — must match (any of the selected)
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

  // Model query (free text contains)
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
    score += W_MODEL; // no model filter = neutral pass
  }

  // Style — any match
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

  // Color — exact or family (if allowCloseColorMatch)
  if (colors.length > 0) {
    const exact = colors.find((c) => c.c.normalizedName === listing.normalizedColor);
    if (exact) {
      score += W_COLOR;
      reasons.push({ field: "color", value: exact.c.name, matched: true, weight: W_COLOR });
    } else if (pref.allowCloseColorMatch) {
      // Look up the listing's color in the reference table to find its family,
      // then compare against the preferred color families.
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

  // Size — any match (skipped if no size preferences set)
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

  // Condition — must meet minimum rank (lower rank = better)
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

  // Price — within range
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

export async function runAllIngests() {
  const sources = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.active, true));
  for (const source of sources) {
    await runMockIngest(source.slug);
  }
}
