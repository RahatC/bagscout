/**
 * SourceAdapter — contract every listing source must implement.
 *
 * Production adapters can later use approved channels (official APIs,
 * affiliate feeds, sitemaps where allowed, merchant-provided feeds,
 * user-submitted watch URLs, or email/newsletter parsing). The current
 * implementations are mocks with realistic sample listings — no scraping,
 * no anti-bot bypass, no terms violations.
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
  description?: string;
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
  /** Public site URL used to compose `source_url` for each listing. */
  baseUrl: string;
  /** Returns the raw listings as the adapter sees them at the source. */
  fetchListings(): Promise<RawListing[]>;
  /** Maps a raw listing to the canonical normalized form. */
  normalizeListing(raw: RawListing): NormalizedListing;
  /** Validates a normalized listing — adapters may add their own rules. */
  validateListing(normalized: NormalizedListing): ValidationResult;
}
