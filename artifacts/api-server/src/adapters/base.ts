import {
  normalizeText,
  normalizeBrand,
  normalizeColor,
  normalizeCondition,
  inferStyle,
  extractModel,
} from "../lib/normalize";
import type {
  NormalizedListing,
  RawListing,
  SourceAdapter,
  ValidationResult,
} from "./types";

/**
 * Default normalize routine — converts a RawListing to a NormalizedListing
 * by canonicalizing brand / color / condition / style / model and computing
 * derived fields (discount %, source URL).
 *
 * Adapters may pre-fill `raw.sourceUrl` (preferred for live scrapers, since
 * the actual product URL is the only reliable canonical link). When absent
 * we synthesise a placeholder from the source baseUrl + externalId.
 */
export function defaultNormalize(
  raw: RawListing,
  meta: { source: string; baseUrl: string },
): NormalizedListing {
  const normalizedBrand = normalizeBrand(raw.brand);
  const normalizedColor = normalizeColor(raw.color);
  const normalizedCondition = normalizeCondition(raw.condition);

  const style = raw.style?.trim() || inferStyle(raw.title);
  const normalizedStyle = normalizeText(style);

  const model = extractModel(raw.title, raw.brand, raw.model);
  const normalizedModel = normalizeText(model);

  const originalPrice = raw.originalPrice ?? null;
  const discountPercent =
    originalPrice && originalPrice > raw.price
      ? Number((((originalPrice - raw.price) / originalPrice) * 100).toFixed(2))
      : null;

  const sourceUrl =
    raw.sourceUrl?.trim() ||
    `${meta.baseUrl.replace(/\/$/, "")}/listing/${encodeURIComponent(raw.externalId)}`;

  return {
    source: meta.source,
    sourceListingId: raw.externalId,
    sourceUrl,
    title: raw.title,
    brand: raw.brand,
    normalizedBrand,
    model,
    normalizedModel,
    style,
    normalizedStyle,
    condition: raw.condition,
    normalizedCondition,
    color: raw.color,
    normalizedColor,
    size: raw.size,
    price: raw.price,
    originalPrice,
    discountPercent,
    currency: raw.currency ?? "USD",
    imageUrl: raw.imageUrl,
    description: raw.description ?? null,
    availabilityStatus: "available",
  };
}

/**
 * Default validation — every NormalizedListing must have a non-empty
 * sourceListingId, title, brand, normalizedBrand, a positive price, and an
 * image URL.
 */
export function defaultValidate(n: NormalizedListing): ValidationResult {
  const errors: string[] = [];
  if (!n.sourceListingId) errors.push("Missing sourceListingId");
  if (!n.title) errors.push("Missing title");
  if (!n.brand) errors.push("Missing brand");
  if (!n.normalizedBrand) errors.push("Missing normalizedBrand");
  if (!Number.isFinite(n.price) || n.price <= 0)
    errors.push(`Invalid price: ${n.price}`);
  if (!n.imageUrl) errors.push("Missing imageUrl");
  if (!n.sourceUrl) errors.push("Missing sourceUrl");
  return { valid: errors.length === 0, errors };
}

/**
 * Convenience factory — builds a SourceAdapter from a static listing array.
 * Used by tests, local dev (`INGEST_USE_MOCK_ADAPTERS=true`), and as the
 * fallback path when a live adapter chooses to fail open.
 */
export function createMockAdapter(opts: {
  sourceName: string;
  sourceSlug: string;
  baseUrl: string;
  listings: RawListing[];
}): SourceAdapter {
  return {
    sourceName: opts.sourceName,
    sourceSlug: opts.sourceSlug,
    baseUrl: opts.baseUrl,
    fetchListings: async () => opts.listings,
    normalizeListing: (raw) =>
      defaultNormalize(raw, { source: opts.sourceName, baseUrl: opts.baseUrl }),
    validateListing: defaultValidate,
  };
}

/**
 * Returns true when the runtime should use the static mock adapters
 * (e.g. tests, offline dev). Set `INGEST_USE_MOCK_ADAPTERS=true` in the env.
 */
export function shouldUseMockAdapters(): boolean {
  const v = process.env["INGEST_USE_MOCK_ADAPTERS"];
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true";
}
