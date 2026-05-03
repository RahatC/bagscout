import { logger } from "../lib/logger";
import {
  createMockAdapter,
  defaultNormalize,
  defaultValidate,
  shouldUseMockAdapters,
} from "./base";
import { RateLimiter } from "./http";
import { fetchShopifyCollectionPage, looksLikeBag } from "./shopify";
import type { RawListing, SourceAdapter } from "./types";

const SOURCE_NAME = "FASHIONPHILE";
const SOURCE_SLUG = "fashionphile";
const BASE_URL = "https://www.fashionphile.com";

// Per-source politeness: ~1 request every 1.5s.
const limiter = new RateLimiter(1500);

// Bag-only collections we crawl. Each is a real, public collection handle
// on the Fashionphile Shopify storefront. Limited to handbags + small
// leather goods that map onto our `bag_styles` reference.
const COLLECTIONS = ["handbags", "shop-best-sellers", "shop-new-arrivals"];

const MAX_PAGES_PER_COLLECTION = 4; // 4 × 50 = up to 200 listings per collection
const PAGE_LIMIT = 50;

async function fetchListings(): Promise<RawListing[]> {
  const seen = new Set<string>();
  const all: RawListing[] = [];
  for (const handle of COLLECTIONS) {
    let page = 1;
    while (page <= MAX_PAGES_PER_COLLECTION) {
      await limiter.acquire();
      let pageListings: RawListing[] = [];
      try {
        pageListings = await fetchShopifyCollectionPage({
          baseUrl: BASE_URL,
          collectionHandle: handle,
          page,
          limit: PAGE_LIMIT,
          source: SOURCE_SLUG,
        });
      } catch (err) {
        // One bad page should not abort the entire run — log and stop the
        // collection, then move on to the next.
        logger.warn(
          { err, source: SOURCE_SLUG, collection: handle, page },
          "fashionphile: collection page fetch failed, skipping rest of collection",
        );
        break;
      }
      if (pageListings.length === 0) break;
      for (const listing of pageListings) {
        if (seen.has(listing.externalId)) continue;
        seen.add(listing.externalId);
        all.push(listing);
      }
      page++;
    }
  }
  // Drop non-bag categories (scarves, jewelry, accessories) that sometimes
  // appear in the "best-sellers" / "new-arrivals" collections.
  const bagOnly = all.filter((listing) => looksLikeBag(listing.title));
  logger.info(
    { source: SOURCE_SLUG, fetched: all.length, kept: bagOnly.length },
    "fashionphile: fetch complete",
  );
  return bagOnly;
}

const liveAdapter: SourceAdapter = {
  sourceName: SOURCE_NAME,
  sourceSlug: SOURCE_SLUG,
  baseUrl: BASE_URL,
  fetchListings,
  normalizeListing: (raw) =>
    defaultNormalize(raw, { source: SOURCE_NAME, baseUrl: BASE_URL }),
  validateListing: defaultValidate,
};

// Tiny mock seed set kept for offline dev / tests when
// INGEST_USE_MOCK_ADAPTERS=true is set.
const mockListings: RawListing[] = [
  {
    externalId: "fp-mock-001",
    title: "Hermès Birkin 30 Etoupe Togo PHW",
    brand: "Hermès",
    model: "Birkin",
    style: "Top Handle",
    color: "Etoupe",
    size: "Birkin 30",
    condition: "Excellent",
    price: 18500,
    originalPrice: 21000,
    imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800",
    description: "Mock listing — enable INGEST_USE_MOCK_ADAPTERS to use these.",
  },
  {
    externalId: "fp-mock-002",
    title: "Chanel Medium Classic Flap Black Caviar GHW",
    brand: "Chanel",
    model: "Classic Flap",
    style: "Shoulder Bag",
    color: "Black",
    size: "Medium",
    condition: "Very Good",
    price: 8200,
    originalPrice: 9000,
    imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
    description: "Mock listing.",
  },
];

const mockAdapter = createMockAdapter({
  sourceName: SOURCE_NAME,
  sourceSlug: SOURCE_SLUG,
  baseUrl: BASE_URL,
  listings: mockListings,
});

export { liveAdapter as fashionphileLiveAdapter, mockAdapter as fashionphileMockAdapter };
const adapter = shouldUseMockAdapters() ? mockAdapter : liveAdapter;
export default adapter;
