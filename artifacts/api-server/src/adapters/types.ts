/**
 * SourceAdapter — contract every listing source must implement.
 *
 * Live adapters fetch listings directly from the marketplace's public
 * surfaces (Shopify storefront APIs, server-rendered HTML, sitemaps). They
 * identify themselves with a clearly-named bot user-agent, respect the
 * source's `robots.txt`, rate-limit their requests, and never bypass
 * anti-bot challenges. When a source can't be reached the adapter returns
 * an empty list and the ingestion run logs the failure but continues with
 * the other sources.
 *
 * Mock adapters (`createMockAdapter` in `base.ts`) are kept for tests and
 * local development under `INGEST_USE_MOCK_ADAPTERS=true`.
 */

export interface RawListing {
  externalId: string;
  title: string;
  brand: string;
  model?: string | null;
  style?: string | null;
  color: string;
  size: string;
  condition: string;
  price: number;
  originalPrice?: number;
  currency?: string;
  imageUrl: string;
  /**
   * Full image gallery for the listing. Order matters — the first entry
   * is treated as the primary product shot. Adapters that only have one
   * image may omit this; the ingest layer will fall back to `[imageUrl]`.
   */
  imageUrls?: string[];
  description?: string;
  /**
   * Optional canonical URL captured during scraping. When set, the
   * normalize step uses it directly instead of synthesising one from
   * `baseUrl + externalId`.
   */
  sourceUrl?: string;
}

export interface NormalizedListing {
  source: string;
  sourceListingId: string;
  sourceUrl: string;
  title: string;
  brand: string;
  normalizedBrand: string;
  model: string;
  normalizedModel: string;
  style: string;
  normalizedStyle: string;
  condition: string;
  normalizedCondition: string;
  color: string;
  normalizedColor: string;
  size: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: string;
  imageUrl: string;
  imageUrls: string[];
  description: string | null;
  availabilityStatus: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SourceAdapter {
  /** Human-readable source label (e.g. "FASHIONPHILE"). */
  sourceName: string;
  /** Slug matching the `sources.slug` reference row (e.g. "fashionphile"). */
  sourceSlug: string;
  /** Public site URL used to compose `source_url` when adapters don't supply one. */
  baseUrl: string;
  /** Returns the raw listings as the adapter sees them at the source. */
  fetchListings(): Promise<RawListing[]>;
  /** Maps a raw listing to the canonical normalized form. */
  normalizeListing(raw: RawListing): NormalizedListing;
  /** Validates a normalized listing — adapters may add their own rules. */
  validateListing(normalized: NormalizedListing): ValidationResult;
}
