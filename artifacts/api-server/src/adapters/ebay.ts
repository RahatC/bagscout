import { logger } from "../lib/logger";
import {
  createMockAdapter,
  defaultNormalize,
  defaultValidate,
} from "./base";
import { httpFetch, HttpFetchError, RateLimiter } from "./http";
import type { RawListing, SourceAdapter } from "./types";

/**
 * Test seam: replace with `fetch` in unit tests. Defaults to global fetch.
 * Kept on a module-level binding (not pulled from globalThis at call time)
 * so tests can swap it via `__setEbayFetch`.
 */
let _fetch: typeof fetch = (...args) => fetch(...args);
export function __setEbayFetch(fn: typeof fetch | null): void {
  _fetch = fn ?? ((...args) => fetch(...args));
}
export function __resetEbayState(): void {
  cachedToken = null;
  warnedMissingCreds = false;
}

/**
 * eBay Browse API adapter.
 *
 * **Why eBay?** It is the largest single source of authenticated luxury bag
 * resale inventory and the only major source we can ingest under a free,
 * official, ToS-compliant API (the eBay Buy / Browse API). No HTML scraping,
 * no robots.txt gymnastics — every request is an official REST call against
 * `api.ebay.com/buy/browse/v1` authorised with the Application access token.
 *
 * **Auth**: OAuth 2.0 client_credentials flow.
 *   - `EBAY_APP_ID` (a.k.a. Client ID) and `EBAY_CERT_ID` (Client Secret) are
 *     issued from https://developer.ebay.com/my/keys (free signup).
 *   - We exchange them for a 2-hour application token at
 *     `api.ebay.com/identity/v1/oauth2/token`.
 *   - The token is cached in-process and refreshed on expiry.
 *   - Set `EBAY_ENV=sandbox` to use the sandbox host instead of production.
 *
 * **Scope**: `https://api.ebay.com/oauth/api_scope` is sufficient for the
 * Browse API public read endpoints.
 *
 * **Search strategy**: we issue one `/item_summary/search` request per
 * canonical brand we care about, scoped to the "Women's Handbags & Bags"
 * leaf category (id `169291`) and an `excellent`-or-better condition filter.
 * Results are paged, deduplicated by `itemId`, and capped per run so a single
 * cycle stays well under any rate budget.
 */

const SOURCE_NAME = "eBay";
const SOURCE_SLUG = "ebay";
const PROD_BASE = "https://api.ebay.com";
const SANDBOX_BASE = "https://api.sandbox.ebay.com";
const PUBLIC_BASE = "https://www.ebay.com";

// eBay's "Women's Bags & Handbags" leaf category. See
// https://www.ebay.com/sch/allcategories — picked at audit time and stable for years.
const HANDBAGS_CATEGORY_ID = "169291";

// We only fetch listings priced ≥ $300 to skip costume / non-luxury stock.
const MIN_PRICE_USD = 300;

// One brand-scoped query per call; we issue them sequentially through the limiter.
const BRAND_QUERIES = [
  "Hermes",
  "Chanel",
  "Louis Vuitton",
  "Dior",
  "Gucci",
  "Prada",
  "Saint Laurent",
  "Celine",
  "Bottega Veneta",
  "Fendi",
  "Loewe",
  "Goyard",
];

const PAGE_LIMIT = 50; // max 200 per eBay docs
const MAX_PAGES_PER_BRAND = 2;

const limiter = new RateLimiter(750); // ~1.3 req/sec — well under daily quota

interface EbayPrice {
  value: string;
  currency: string;
}

interface EbayImage {
  imageUrl: string;
}

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: EbayPrice;
  itemWebUrl?: string;
  image?: EbayImage;
  thumbnailImages?: EbayImage[];
  condition?: string;
  conditionId?: string;
  shortDescription?: string;
  itemLocation?: { country?: string };
  seller?: { username?: string; feedbackPercentage?: string };
  marketingPrice?: {
    originalPrice?: EbayPrice;
    discountPercentage?: string;
  };
  buyingOptions?: string[];
}

interface EbaySearchResponse {
  total?: number;
  itemSummaries?: EbayItemSummary[];
  next?: string;
}

interface EbayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let warnedMissingCreds = false;

function ebayBaseUrl(): string {
  return process.env.EBAY_ENV === "sandbox" ? SANDBOX_BASE : PROD_BASE;
}

/**
 * Returns true when the eBay live adapter has the env it needs to talk to
 * the API. When false, the registry should swap in the mock adapter so the
 * application keeps running.
 */
export function ebayCredentialsConfigured(): boolean {
  return Boolean(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID);
}

async function getApplicationToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    throw new Error(
      "eBay adapter is in live mode but EBAY_APP_ID / EBAY_CERT_ID are not set",
    );
  }
  const basic = Buffer.from(`${appId}:${certId}`).toString("base64");
  const tokenUrl = `${ebayBaseUrl()}/identity/v1/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  }).toString();
  // OAuth client_credentials requires POST + form body — the shared
  // `httpFetch` helper is GET-only, so we POST directly with `fetch` and a
  // hand-rolled timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await _fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `eBay token endpoint returned ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const tok = (await res.json()) as EbayTokenResponse;
  if (!tok || !tok.access_token) {
    throw new Error("eBay token endpoint returned no access_token");
  }
  cachedToken = {
    token: tok.access_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  };
  return cachedToken.token;
}

// Re-export for tests so they can call the (otherwise private) token fetcher.
export const __getApplicationToken = getApplicationToken;

/**
 * One paged search call against /buy/browse/v1/item_summary/search.
 */
async function searchBrandPage(
  brand: string,
  page: number,
  token: string,
): Promise<EbayItemSummary[]> {
  const offset = (page - 1) * PAGE_LIMIT;
  const filterParts = [
    `categoryIds:{${HANDBAGS_CATEGORY_ID}}`,
    `price:[${MIN_PRICE_USD}],priceCurrency:USD`,
    "buyingOptions:{FIXED_PRICE|AUCTION}",
    "conditions:{NEW|LIKE_NEW|USED_EXCELLENT|USED_VERY_GOOD}",
  ];
  const params = new URLSearchParams({
    q: brand,
    category_ids: HANDBAGS_CATEGORY_ID,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    filter: filterParts.join(","),
  });
  const url = `${ebayBaseUrl()}/buy/browse/v1/item_summary/search?${params.toString()}`;
  const json = await httpFetch<EbaySearchResponse>(url, "json", {
    timeoutMs: 20_000,
    retries: 3,
    backoffMs: 800,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": "contextualLocation=country=US,zip=10001",
    },
    context: { source: SOURCE_SLUG, brand, page },
  });
  return Array.isArray(json?.itemSummaries) ? json!.itemSummaries! : [];
}

/**
 * eBay condition strings from the Browse API ("New", "Pre-Owned", "Excellent",
 * etc.) → the canonical conditions that BagScout's matcher and reference table
 * understand.
 */
function mapCondition(input?: string, conditionId?: string): string {
  // Prefer the numeric id when present (more stable than free text).
  if (conditionId) {
    switch (conditionId) {
      case "1000":
      case "1500":
      case "1750":
        return "New with Tags";
      case "2000":
      case "2010":
        return "Pristine";
      case "2020":
      case "2030":
        return "Excellent";
      case "2500":
      case "3000":
        return "Very Good";
      case "4000":
        return "Good";
      case "5000":
      case "6000":
      case "7000":
        return "Fair";
    }
  }
  const t = (input ?? "").toLowerCase();
  if (t.includes("new with tags") || t === "new") return "New with Tags";
  if (t.includes("like new") || t.includes("mint") || t.includes("pristine")) return "Pristine";
  if (t.includes("excellent")) return "Excellent";
  if (t.includes("very good")) return "Very Good";
  if (t.includes("good")) return "Good";
  if (t.includes("acceptable") || t.includes("used")) return "Fair";
  return "Good";
}

export function mapEbayItem(item: EbayItemSummary): RawListing | null {
  const price = item.price ? Number(item.price.value) : NaN;
  if (!Number.isFinite(price) || price <= 0) return null;
  const image = item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl;
  if (!image) return null;
  if (!item.title) return null;

  // Try to pull a brand off the title prefix; the matcher's normalizer will
  // canonicalise it. eBay doesn't return a brand field on item summaries.
  const titleTokens = item.title.trim().split(/\s+/);
  const brandGuess = titleTokens.slice(0, 2).join(" ");

  const originalPriceRaw = item.marketingPrice?.originalPrice?.value;
  const originalPrice = originalPriceRaw ? Number(originalPriceRaw) : undefined;

  return {
    externalId: item.itemId,
    title: item.title.trim(),
    brand: brandGuess,
    model: null,
    style: null,
    color: "Multi", // matcher will fall back to color extraction from title
    size: "Medium", // ditto for size
    condition: mapCondition(item.condition, item.conditionId),
    price,
    originalPrice:
      originalPrice && originalPrice > price ? originalPrice : undefined,
    currency: item.price?.currency ?? "USD",
    imageUrl: image,
    description: item.shortDescription,
    sourceUrl: item.itemWebUrl,
  };
}

async function fetchListings(): Promise<RawListing[]> {
  if (!ebayCredentialsConfigured()) {
    if (!warnedMissingCreds) {
      logger.warn(
        { source: SOURCE_SLUG },
        "ebay: EBAY_APP_ID / EBAY_CERT_ID not set — live adapter is a no-op until configured. Flip sources.ingestion_mode='mock' to suppress, or add the secrets.",
      );
      warnedMissingCreds = true;
    }
    return [];
  }
  const token = await getApplicationToken();
  const seen = new Set<string>();
  const out: RawListing[] = [];

  for (const brand of BRAND_QUERIES) {
    for (let page = 1; page <= MAX_PAGES_PER_BRAND; page++) {
      await limiter.acquire();
      let items: EbayItemSummary[] = [];
      try {
        items = await searchBrandPage(brand, page, token);
      } catch (err) {
        // Auth errors invalidate the cached token and retry once.
        if (err instanceof HttpFetchError && err.status === 401) {
          logger.warn(
            { source: SOURCE_SLUG, brand, page },
            "ebay: 401 — refreshing token and retrying",
          );
          cachedToken = null;
          try {
            const fresh = await getApplicationToken();
            items = await searchBrandPage(brand, page, fresh);
          } catch (err2) {
            logger.error({ err: err2, brand, page }, "ebay: retry after 401 failed");
            break;
          }
        } else {
          logger.warn(
            { err, source: SOURCE_SLUG, brand, page },
            "ebay: search page failed, moving on",
          );
          break;
        }
      }
      if (items.length === 0) break;
      for (const item of items) {
        if (seen.has(item.itemId)) continue;
        seen.add(item.itemId);
        const mapped = mapEbayItem(item);
        if (mapped) out.push(mapped);
      }
    }
  }
  logger.info({ source: SOURCE_SLUG, count: out.length }, "ebay: fetch complete");
  return out;
}

const liveAdapter: SourceAdapter = {
  sourceName: SOURCE_NAME,
  sourceSlug: SOURCE_SLUG,
  baseUrl: PUBLIC_BASE,
  fetchListings,
  normalizeListing: (raw) =>
    defaultNormalize(raw, { source: SOURCE_NAME, baseUrl: PUBLIC_BASE }),
  validateListing: defaultValidate,
};

// Mock seed used when EBAY credentials are absent or sources.ingestion_mode='mock'.
const mockListings: RawListing[] = [
  {
    externalId: "ebay-mock-001",
    title: "Hermès Kelly 28 Sellier Black Box Calf PHW",
    brand: "Hermès",
    model: "Kelly",
    style: "Top Handle",
    color: "Black",
    size: "Kelly 28",
    condition: "Pristine",
    price: 22500,
    originalPrice: 26000,
    imageUrl: "https://images.unsplash.com/photo-1591348278863-a8fb3887e2aa?w=800",
    description: "Mock eBay listing",
  },
  {
    externalId: "ebay-mock-002",
    title: "Louis Vuitton Neverfull MM Damier Ebene",
    brand: "Louis Vuitton",
    model: "Neverfull",
    style: "Tote",
    color: "Brown",
    size: "MM",
    condition: "Very Good",
    price: 1450,
    imageUrl: "https://images.unsplash.com/photo-1564422170194-896b89110ef8?w=800",
    description: "Mock eBay listing",
  },
];

const mockAdapter = createMockAdapter({
  sourceName: SOURCE_NAME,
  sourceSlug: SOURCE_SLUG,
  baseUrl: PUBLIC_BASE,
  listings: mockListings,
});

export { liveAdapter as ebayLiveAdapter, mockAdapter as ebayMockAdapter };

// Default export: live adapter when configured, otherwise mock. The
// per-source dispatcher in `ingest.ts` may still force the mock path based
// on `sources.ingestion_mode`.
const adapter: SourceAdapter = ebayCredentialsConfigured() ? liveAdapter : mockAdapter;
export default adapter;
