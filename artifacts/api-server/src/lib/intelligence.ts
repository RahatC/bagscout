import { and, eq, ne, sql, asc, desc } from "drizzle-orm";
import {
  db,
  listingsTable,
  listingSnapshotsTable,
  sourcesTable,
  colorsTable,
} from "@workspace/db";

/**
 * Brand desirability — drives the brand-portion of the deal score.
 * Hard-coded for now; in the future we'd persist per-brand weights.
 */
const BRAND_DESIRABILITY: Record<string, number> = {
  hermes: 1.0,
  hermès: 1.0,
  chanel: 0.95,
  louis_vuitton: 0.85,
  gucci: 0.75,
  prada: 0.75,
  dior: 0.85,
  fendi: 0.7,
  saint_laurent: 0.7,
  ysl: 0.7,
  bottega_veneta: 0.7,
  celine: 0.75,
  céline: 0.75,
  goyard: 0.85,
};

/**
 * Per-source credibility (0–1). Falls back to 0.7 if unknown.
 */
const SOURCE_CREDIBILITY: Record<string, number> = {
  fashionphile: 0.95,
  the_realreal: 0.85,
  rebag: 0.9,
  yoogis_closet: 0.85,
  vestiaire_collective: 0.8,
};

export type IntelligenceUpdate = {
  dealScore: number;
  marketLow: number | null;
  marketMedian: number | null;
  marketHigh: number | null;
  marketSampleSize: number;
  scarcityTier: "common" | "uncommon" | "rare" | "very_rare";
  priceVerdict: "below" | "fair" | "expensive" | null;
};

function median(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 === 0
    ? (sortedAsc[mid - 1] + sortedAsc[mid]) / 2
    : sortedAsc[mid];
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.round(p * (sortedAsc.length - 1))),
  );
  return sortedAsc[idx];
}

function scarcityFromCount(n: number): IntelligenceUpdate["scarcityTier"] {
  if (n >= 12) return "common";
  if (n >= 5) return "uncommon";
  if (n >= 2) return "rare";
  return "very_rare";
}

function brandWeight(normalizedBrand: string | null): number {
  if (!normalizedBrand) return 0.5;
  return BRAND_DESIRABILITY[normalizedBrand] ?? 0.6;
}

function sourceWeight(slug: string | null): number {
  if (!slug) return 0.7;
  return SOURCE_CREDIBILITY[slug] ?? 0.7;
}

function freshnessScore(firstSeenAt: Date | null | string): number {
  if (!firstSeenAt) return 0.5;
  const seen = typeof firstSeenAt === "string" ? new Date(firstSeenAt) : firstSeenAt;
  const days = (Date.now() - seen.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 1) return 1;
  if (days < 3) return 0.9;
  if (days < 7) return 0.75;
  if (days < 14) return 0.6;
  if (days < 30) return 0.45;
  return 0.25;
}

function conditionWeight(rank: number | null | undefined): number {
  // Lower rank = better condition. Ranks ~1–6 in our seed data.
  if (rank == null) return 0.5;
  if (rank <= 1) return 1;
  if (rank <= 2) return 0.85;
  if (rank <= 3) return 0.7;
  if (rank <= 4) return 0.55;
  if (rank <= 5) return 0.4;
  return 0.25;
}

/**
 * Compute the price-vs-median axis. Centered at 0.5 when the listing is
 * priced exactly at median; returns higher for cheaper-than-median.
 */
function priceAxis(price: number, marketMedian: number | null): number {
  if (!marketMedian || marketMedian <= 0) return 0.5;
  // ratio of how far below the median — clip to [-1, 1] then map to [0, 1]
  const delta = (marketMedian - price) / marketMedian;
  const clamped = Math.max(-1, Math.min(1, delta));
  return (clamped + 1) / 2;
}

function priceVerdict(
  price: number,
  low: number | null,
  high: number | null,
): IntelligenceUpdate["priceVerdict"] {
  if (low == null || high == null) return null;
  if (price < low) return "below";
  if (price > high) return "expensive";
  return "fair";
}

/**
 * Recompute and persist intelligence fields for a single listing.
 * Called from the ingest pipeline after every snapshot.
 */
export async function recomputeListingIntelligence(
  listingId: number,
): Promise<IntelligenceUpdate | null> {
  const [row] = await db
    .select({
      listing: listingsTable,
      source: sourcesTable,
    })
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(listingsTable.id, listingId));
  if (!row) return null;

  const listing = row.listing;
  const source = row.source;
  const price = parseFloat(listing.price);

  // Pull the color family for "similar" matching.
  let colorFamily: string | null = null;
  if (listing.normalizedColor) {
    const [cf] = await db
      .select({ family: colorsTable.family })
      .from(colorsTable)
      .where(eq(colorsTable.normalizedName, listing.normalizedColor));
    colorFamily = cf?.family ?? null;
  }

  // Build a "similar listings" bucket: same brand, optionally same style + same
  // color family. Available only.
  const similarConds = [
    eq(listingsTable.normalizedBrand, listing.normalizedBrand),
    eq(listingsTable.availabilityStatus, "available"),
    ne(listingsTable.id, listing.id),
  ];
  if (listing.normalizedStyle) {
    similarConds.push(eq(listingsTable.normalizedStyle, listing.normalizedStyle));
  }

  const similar = await db
    .select({ price: listingsTable.price })
    .from(listingsTable)
    .where(and(...similarConds));

  // Use color-family filter if it leaves us with a usable sample.
  const similarPrices = similar.map((s) => parseFloat(s.price)).filter((n) => !isNaN(n));
  similarPrices.sort((a, b) => a - b);

  const sampleSize = similarPrices.length;
  const marketLow = percentile(similarPrices, 0.2);
  const marketMedian = median(similarPrices);
  const marketHigh = percentile(similarPrices, 0.8);

  const scarcityTier = scarcityFromCount(sampleSize);
  const verdict = priceVerdict(price, marketLow, marketHigh);

  // Price drop history — count snapshots showing a meaningful (>=2%) drop.
  const snaps = await db
    .select({ price: listingSnapshotsTable.price, capturedAt: listingSnapshotsTable.capturedAt })
    .from(listingSnapshotsTable)
    .where(eq(listingSnapshotsTable.listingId, listing.id))
    .orderBy(asc(listingSnapshotsTable.capturedAt));
  let drops = 0;
  for (let i = 1; i < snaps.length; i++) {
    const prev = parseFloat(snaps[i - 1].price);
    const curr = parseFloat(snaps[i].price);
    if (prev > 0 && (prev - curr) / prev >= 0.02) drops++;
  }
  const dropAxis = Math.min(1, drops * 0.34); // 0 -> 0, 1 -> 0.34, 3+ -> 1

  // Condition rank lookup is cheap to compute later; for the scoring axis we
  // map normalizedCondition to a heuristic rank if rank lookup isn't available.
  const condRank = listing.normalizedCondition
    ? heuristicConditionRank(listing.normalizedCondition)
    : null;

  // Weighted deal score (0–100).
  const score =
    35 * priceAxis(price, marketMedian) +
    20 * conditionWeight(condRank) +
    15 * brandWeight(listing.normalizedBrand) +
    10 * sourceWeight(source.slug) +
    10 * freshnessScore(listing.firstSeenAt) +
    10 * dropAxis;

  const dealScore = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

  await db
    .update(listingsTable)
    .set({
      dealScore: dealScore.toFixed(1),
      marketLow: marketLow != null ? marketLow.toFixed(2) : null,
      marketMedian: marketMedian != null ? marketMedian.toFixed(2) : null,
      marketHigh: marketHigh != null ? marketHigh.toFixed(2) : null,
      marketSampleSize: sampleSize,
      scarcityTier,
      priceVerdict: verdict,
    })
    .where(eq(listingsTable.id, listing.id));

  return {
    dealScore,
    marketLow,
    marketMedian,
    marketHigh,
    marketSampleSize: sampleSize,
    scarcityTier,
    priceVerdict: verdict,
  };
}

/**
 * Quick mapping from common normalized condition strings to a numeric rank.
 * Matches the seed values in `conditions` (lower = better).
 */
function heuristicConditionRank(normalized: string): number {
  if (normalized.includes("new") || normalized === "pristine") return 1;
  if (normalized.includes("excellent") || normalized.includes("mint")) return 2;
  if (normalized.includes("very_good") || normalized.includes("very good")) return 3;
  if (normalized.includes("good")) return 4;
  if (normalized.includes("fair")) return 5;
  if (normalized.includes("poor")) return 6;
  return 4;
}

/**
 * "Why now?" tag generator — one short urgency line per alert. Uses the alert
 * type and snapshot context to pick the most compelling phrase.
 */
export function buildWhyNow(opts: {
  alertType: string;
  matchType?: string;
  priceDropPercent?: number | null;
  scarcityTier?: string | null;
  priceVerdict?: string | null;
  underTargetBy?: number | null;
  isNewListing?: boolean;
  isExactModel?: boolean;
}): string {
  const {
    alertType,
    priceDropPercent,
    scarcityTier,
    priceVerdict: pv,
    underTargetBy,
    isNewListing,
    isExactModel,
  } = opts;

  if (alertType === "price_drop" && priceDropPercent && priceDropPercent > 0) {
    return `Price dropped ${Math.round(priceDropPercent)}%`;
  }
  if (alertType === "back_in_stock") return "Back in stock";
  if (alertType === "better_condition") return "Better condition than before";
  if (alertType === "exact_model" || isExactModel) return "Exact model match";
  if (alertType === "under_target_price" && underTargetBy != null) {
    return `Under your target by $${Math.round(underTargetBy).toLocaleString()}`;
  }
  if (scarcityTier === "very_rare") return "Very rare — few like this on the market";
  if (scarcityTier === "rare") return "Rare find for this combination";
  if (pv === "below") return "Priced below typical range";
  if (isNewListing) return "Newly listed";
  return "Worth a look right now";
}
