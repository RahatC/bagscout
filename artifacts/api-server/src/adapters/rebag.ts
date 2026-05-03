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

const SOURCE_NAME = "Rebag";
const SOURCE_SLUG = "rebag";
// Rebag's primary site is rebag.com but the actual storefront with product
// data is shop.rebag.com (Shopify). We crawl that one and store user-facing
// product links there.
const SHOP_URL = "https://shop.rebag.com";
// External base URL stored on the source row for display purposes.
const BASE_URL = "https://www.rebag.com";

const limiter = new RateLimiter(1500);

const COLLECTIONS = ["all", "new-arrivals"];
const MAX_PAGES_PER_COLLECTION = 4;
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
          baseUrl: SHOP_URL,
          collectionHandle: handle,
          page,
          limit: PAGE_LIMIT,
          source: SOURCE_SLUG,
        });
      } catch (err) {
        logger.warn(
          { err, source: SOURCE_SLUG, collection: handle, page },
          "rebag: collection page fetch failed, skipping rest of collection",
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
  // Filter out non-bag categories (small leather goods, accessories, shoes).
  const bagOnly = all.filter((listing) => looksLikeBag(listing.title));
  logger.info(
    { source: SOURCE_SLUG, fetched: all.length, kept: bagOnly.length },
    "rebag: fetch complete",
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

const mockListings: RawListing[] = [
  {
    externalId: "rb-mock-001",
    title: "Hermès Kelly 28 Sellier Gold Epsom GHW",
    brand: "Hermès",
    model: "Kelly",
    style: "Top Handle",
    color: "Gold",
    size: "Kelly 28",
    condition: "Excellent",
    price: 22000,
    imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800",
    description: "Mock listing.",
  },
  {
    externalId: "rb-mock-002",
    title: "Bottega Veneta Jodie Parakeet Medium",
    brand: "Bottega Veneta",
    model: "Jodie",
    style: "Hobo",
    color: "Parakeet",
    size: "Medium",
    condition: "Very Good",
    price: 1850,
    originalPrice: 2200,
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

export { liveAdapter as rebagLiveAdapter, mockAdapter as rebagMockAdapter };
const adapter = shouldUseMockAdapters() ? mockAdapter : liveAdapter;
export default adapter;
