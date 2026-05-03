import type { listingsTable, sourcesTable } from "@workspace/db";

type DbListing = typeof listingsTable.$inferSelect;
type DbSource = typeof sourcesTable.$inferSelect;

/**
 * Map a DB listing row + its source row to the JSON-friendly Listing payload
 * the OpenAPI spec describes. Centralised so every route returns the same
 * shape (especially the new intelligence fields, which are stored as numeric
 * strings in Postgres and must be parsed for the API).
 */
export function mapListing(l: DbListing, source: DbSource) {
  const num = (v: string | null | undefined) =>
    v == null || v === "" ? null : parseFloat(v);
  return {
    id: l.id,
    sourceId: l.sourceId,
    sourceName: source.name,
    sourceListingId: l.sourceListingId,
    sourceUrl: l.sourceUrl,
    title: l.title,
    brand: l.brand,
    model: l.model,
    style: l.style,
    condition: l.condition,
    color: l.color,
    size: l.size,
    normalizedBrand: l.normalizedBrand,
    normalizedModel: l.normalizedModel,
    normalizedStyle: l.normalizedStyle,
    normalizedCondition: l.normalizedCondition,
    normalizedColor: l.normalizedColor,
    price: parseFloat(l.price),
    currency: l.currency,
    originalPrice: num(l.originalPrice),
    discountPercent: num(l.discountPercent),
    imageUrl: l.imageUrl,
    imageUrls: l.imageUrls && l.imageUrls.length > 0
      ? l.imageUrls
      : (l.imageUrl ? [l.imageUrl] : []),
    description: l.description,
    availabilityStatus: l.availabilityStatus,
    dealScore: num(l.dealScore),
    marketLow: num(l.marketLow),
    marketMedian: num(l.marketMedian),
    marketHigh: num(l.marketHigh),
    marketSampleSize: l.marketSampleSize,
    scarcityTier: l.scarcityTier,
    priceVerdict: l.priceVerdict,
    firstSeenAt: l.firstSeenAt,
    lastSeenAt: l.lastSeenAt,
    createdAt: l.createdAt,
  };
}
