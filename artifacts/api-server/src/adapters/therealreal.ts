import * as cheerio from "cheerio";
import { logger } from "../lib/logger";
import {
  createMockAdapter,
  defaultNormalize,
  defaultValidate,
  shouldUseMockAdapters,
} from "./base";
import { httpFetch, HttpFetchError, RateLimiter } from "./http";
import { decodeEntities, extractColor, extractCondition, extractSize, parsePrice } from "./parse";
import type { RawListing, SourceAdapter } from "./types";

const SOURCE_NAME = "The RealReal";
const SOURCE_SLUG = "therealreal";
const BASE_URL = "https://www.therealreal.com";

const limiter = new RateLimiter(3000);

// TRR's product listing pages live under /shop/women/handbags/<designer>.
// They are aggressively protected by PerimeterX which serves a 403 captcha
// page to non-browser clients (including ours). The adapter still attempts
// a fetch on each cycle so we record the degraded state in
// `ingestion_logs` and surface it on the source row, but no listings are
// extracted when the captcha page is returned.
const LISTING_PATHS = [
  "/shop/women/handbags/chanel",
  "/shop/women/handbags/hermes",
  "/shop/women/handbags/louis-vuitton",
  "/shop/women/handbags/gucci",
  "/shop/women/handbags/celine",
];

const PRODUCT_HREF_RE = /\/products\/([a-z0-9][a-z0-9-]+)\b/i;

/**
 * Detect TRR's PerimeterX captcha page so we can fail loudly rather than
 * scribbling junk into the ingestion log.
 */
function isCaptchaPage(html: string): boolean {
  return /px-captcha|PerimeterX|Access to this page has been denied/i.test(
    html.slice(0, 4000),
  );
}

/**
 * Parse one TRR listing page. JSON-LD `ItemList` blocks are the most
 * reliable surface but TRR also sprinkles `data-product-id` attributes on
 * each card; we use both so the parser keeps working as their markup
 * evolves. Pulled into a pure function so we can unit-test against a
 * fixture without ever calling the live site.
 */
export function parseTrrListingHtml(html: string): RawListing[] {
  if (isCaptchaPage(html)) return [];

  const out: RawListing[] = [];
  const seen = new Set<string>();

  // Path 1: JSON-LD ItemList blocks.
  const $ = cheerio.load(html);
  $('script[type="application/ld+json"]').each((_, el) => {
    let json: unknown;
    try {
      json = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const items = collectProductItems(json);
    for (const item of items) {
      const raw = mapJsonLdProduct(item);
      if (raw && !seen.has(raw.externalId)) {
        seen.add(raw.externalId);
        out.push(raw);
      }
    }
  });

  // Path 2: card-level fallback if JSON-LD missing.
  if (out.length === 0) {
    $("a[href*='/products/']").each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href") ?? "";
      const m = PRODUCT_HREF_RE.exec(href);
      if (!m) return;
      const externalId = m[1];
      if (seen.has(externalId)) return;

      const title = decodeEntities(
        ($a.attr("title") ?? $a.find(".product-title, [class*='title']").first().text() ?? "").trim(),
      );
      const priceText = $a.find("[class*='price']").first().text().trim();
      const price = parsePrice(priceText);
      const img = $a.find("img").first();
      const imageUrl = (img.attr("src") ?? img.attr("data-src") ?? "").trim();
      const brand = decodeEntities(
        $a.find("[class*='designer'], [class*='brand']").first().text().trim(),
      );
      if (!title || !price || !imageUrl || !brand) return;

      seen.add(externalId);
      out.push({
        externalId,
        title,
        brand,
        model: null,
        style: null,
        color: extractColor(title, "Multi"),
        size: extractSize(title, "Medium"),
        condition: extractCondition(title, "Very Good"),
        price,
        currency: "USD",
        imageUrl,
        sourceUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      });
    });
  }

  return out;
}

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  brand?: string | { name?: string };
  image?: string | string[];
  url?: string;
  productID?: string;
  sku?: string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
  itemCondition?: string;
  color?: string;
}

function collectProductItems(node: unknown): JsonLdProduct[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(collectProductItems);
  if (typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) {
    return [obj as JsonLdProduct];
  }
  // ItemList → look at itemListElement.
  if (obj["itemListElement"]) return collectProductItems(obj["itemListElement"]);
  if (obj["item"]) return collectProductItems(obj["item"]);
  return [];
}

function mapJsonLdProduct(item: JsonLdProduct): RawListing | null {
  const externalId = item.productID ?? item.sku ?? null;
  const title = item.name ?? null;
  const url = item.url ?? null;
  const brand =
    typeof item.brand === "string" ? item.brand : item.brand?.name ?? null;
  const image = Array.isArray(item.image) ? item.image[0] : item.image ?? null;
  const price =
    item.offers?.price != null ? parsePrice(String(item.offers.price)) : null;

  if (!externalId || !title || !brand || !image || !price) return null;

  return {
    externalId: String(externalId),
    title,
    brand,
    model: null,
    style: null,
    color: item.color ?? extractColor(title, "Multi"),
    size: extractSize(title, "Medium"),
    condition: extractCondition(item.itemCondition ?? title, "Very Good"),
    price,
    currency: item.offers?.priceCurrency ?? "USD",
    imageUrl: image,
    sourceUrl: url ?? undefined,
  };
}

async function fetchListings(): Promise<RawListing[]> {
  const seen = new Set<string>();
  const all: RawListing[] = [];
  let blockedPages = 0;
  let attemptedPages = 0;

  for (const path of LISTING_PATHS) {
    await limiter.acquire();
    attemptedPages++;
    let html: string | null = null;
    try {
      html = await httpFetch<string>(`${BASE_URL}${path}`, "html", {
        asBrowser: true,
        timeoutMs: 20_000,
        retries: 2,
        backoffMs: 1500,
        context: { source: SOURCE_SLUG, path },
      });
    } catch (err) {
      const status = err instanceof HttpFetchError ? err.status : null;
      if (status === 403) blockedPages++;
      logger.warn(
        { err, source: SOURCE_SLUG, path, status },
        "therealreal: listing page fetch failed",
      );
      continue;
    }
    if (!html) continue;
    if (isCaptchaPage(html)) {
      blockedPages++;
      logger.warn(
        { source: SOURCE_SLUG, path },
        "therealreal: PerimeterX captcha page returned, skipping",
      );
      continue;
    }
    const listings = parseTrrListingHtml(html);
    for (const l of listings) {
      if (seen.has(l.externalId)) continue;
      seen.add(l.externalId);
      all.push(l);
    }
  }

  if (blockedPages === attemptedPages && attemptedPages > 0) {
    // Surface a recognisable error message that the ingest layer will
    // persist into `ingestion_logs.errorMessage` and the source row's
    // status (via runMockIngest's "errors" path) so the admin page shows
    // the source as degraded rather than silently empty.
    throw new Error(
      `TheRealReal: all ${attemptedPages} listing pages were blocked by PerimeterX (anti-bot challenge). 0 listings ingested.`,
    );
  }

  logger.info(
    { source: SOURCE_SLUG, count: all.length, blockedPages, attemptedPages },
    "therealreal: fetch complete",
  );
  return all;
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
    externalId: "trr-mock-001",
    title: "Celine Mini Belt Bag Tan Calfskin",
    brand: "Celine",
    model: "Belt Bag",
    style: "Top Handle",
    color: "Tan",
    size: "Mini",
    condition: "Excellent",
    price: 2200,
    imageUrl: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800",
    description: "Mock listing.",
  },
];

const mockAdapter = createMockAdapter({
  sourceName: SOURCE_NAME,
  sourceSlug: SOURCE_SLUG,
  baseUrl: BASE_URL,
  listings: mockListings,
});

const adapter = shouldUseMockAdapters() ? mockAdapter : liveAdapter;
export default adapter;
