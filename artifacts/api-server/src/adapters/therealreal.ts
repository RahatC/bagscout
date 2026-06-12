import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { logger } from "../lib/logger";
import {
  createMockAdapter,
  defaultNormalize,
  defaultValidate,
  shouldUseMockAdapters,
} from "./base";
import { httpFetch, RateLimiter } from "./http";
import { decodeEntities, extractColor, extractCondition, extractSize, parsePrice } from "./parse";
import type { RawListing, SourceAdapter } from "./types";

const SOURCE_NAME = "The RealReal";
const SOURCE_SLUG = "therealreal";
const BASE_URL = "https://www.therealreal.com";

/**
 * The RealReal aggressively blocks server-side HTML / sitemap crawls with
 * PerimeterX (every public surface — including robots.txt-listed sitemaps —
 * returns the px-captcha 403 to non-browser clients). Rather than try to
 * defeat the bot challenge, this adapter consumes TRR's partner product
 * feed: a standard Google Merchant XML feed (RSS 2.0 with the `g:`
 * namespace) which TRR republishes through the affiliate networks they
 * work with (Impact, Awin, Skimlinks). That feed is the sustainable,
 * within-terms ingestion surface for this source.
 *
 * Configuration:
 *   - TRR_FEED_URL          fully-qualified URL of the partner XML feed.
 *                           When set we fetch it on every cycle.
 *   - TRR_FEED_FIXTURE_PATH absolute path to a local feed file (overrides
 *                           the bundled fixture; useful for ops to drop a
 *                           freshly captured feed without redeploying).
 *
 * Behaviour:
 *   - With TRR_FEED_URL set: live HTTP fetch of the partner feed.
 *   - Without TRR_FEED_URL but in non-production: the bundled
 *     `__fixtures__/therealreal_feed.xml` is parsed so dev/test still get
 *     listings flowing.
 *   - Without TRR_FEED_URL in production: the adapter throws a clear
 *     "needs TRR_FEED_URL configured" error so the source row is marked
 *     `degraded` with an actionable message in the admin UI.
 */
const FEED_URL_ENV = "TRR_FEED_URL";
const FEED_FIXTURE_PATH_ENV = "TRR_FEED_FIXTURE_PATH";

const limiter = new RateLimiter(2000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_FIXTURE_PATH = path.join(
  __dirname,
  "__fixtures__",
  "therealreal_feed.xml",
);

/**
 * Heuristic to decide whether a feed entry is a handbag (vs. SLG, scarves,
 * shoes, jewellery — TRR's feed contains the full catalogue). We accept an
 * entry when either the `g:google_product_category` matches Google's
 * canonical "Handbags" leaf, or when the `g:product_type` breadcrumb names
 * a handbag-style category. Anything else is dropped at the adapter so the
 * matcher and dashboard only ever see actual bags.
 */
function isHandbagEntry(opts: {
  googleCategory: string;
  productType: string;
  title: string;
}): boolean {
  // Match against the leaf only — Google's canonical taxonomy uses
  // "Apparel & Accessories > Handbags, Wallets & Cases > Handbags" as
  // the parent for many sibling leaves (Wallets, Card Cases, …) and we
  // only want the Handbags leaf.
  const gcLeaf = (opts.googleCategory.split(">").pop() ?? "").trim().toLowerCase();
  if (gcLeaf === "handbags") return true;
  if (
    gcLeaf === "wallets" ||
    gcLeaf === "wallets & money clips" ||
    gcLeaf === "card cases & money holders" ||
    gcLeaf === "luggage & duffel bags" ||
    gcLeaf.includes("scarves") ||
    gcLeaf.includes("shoes")
  ) {
    return false;
  }
  const pt = opts.productType.toLowerCase();
  if (
    pt.includes("handbag") ||
    pt.includes("shoulder bag") ||
    pt.includes("top handle") ||
    pt.includes("crossbody") ||
    pt.includes("tote") ||
    pt.includes("hobo") ||
    pt.includes("clutch") ||
    pt.includes("bucket bag") ||
    pt.includes("satchel")
  ) {
    return true;
  }
  // Final fallback: title naming a clearly non-bag category should be rejected.
  const titleLower = opts.title.toLowerCase();
  const dropTerms = ["scarf", "card holder", "wallet", "key pouch", "shoe", "boot", "sneaker"];
  for (const term of dropTerms) {
    if (titleLower.includes(term)) return false;
  }
  return false;
}

/**
 * Parse a money string like `"18500.00 USD"` or `"1850 USD"` into
 * `{ amount, currency }`. Returns null on garbage so the parent skips the
 * entry instead of writing a bad price.
 */
function parseMoney(text: string): { amount: number; currency: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  // Money fields in Google Merchant feeds are "<amount> <ISO currency>".
  const m = /^([0-9.,]+)\s*([A-Z]{3})?$/.exec(trimmed);
  if (!m) {
    const fallback = parsePrice(trimmed);
    return fallback ? { amount: fallback, currency: "USD" } : null;
  }
  const amount = parsePrice(m[1]);
  if (!amount) return null;
  return { amount, currency: m[2] ?? "USD" };
}

/**
 * Map TRR's Google Merchant `g:condition` enum + the description's
 * condition note (Pristine / Excellent / Very Good / Good) onto our
 * canonical condition string. The description note is more granular so it
 * wins when present; otherwise we fall back to the schema enum.
 */
function pickCondition(
  schemaCondition: string,
  description: string,
  title: string,
): string {
  const fromText = extractCondition(description || title, "");
  if (fromText) return fromText;
  const c = (schemaCondition || "").toLowerCase().trim();
  if (c === "new") return "New";
  if (c === "refurbished") return "Excellent";
  // TRR encodes everything else as "used"; without a description note the
  // safest neutral default is "Very Good" (TRR's own median grading).
  return "Very Good";
}

/**
 * Pull every direct child of an `<item>` into a tag → text-content map.
 * Cheerio's CSS selectors don't reliably match prefixed XML tag names
 * (`g:id`) across all parser configurations, so we sidestep selectors and
 * read the tag name directly. Tag names are lower-cased to match the
 * Google Merchant spec which itself is case-insensitive.
 */
function readItemFields(
  $: cheerio.CheerioAPI,
  $item: cheerio.Cheerio<AnyNode>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  $item.children().each((_, child) => {
    const node = child as { type?: string; name?: string; tagName?: string };
    if (node.type && node.type !== "tag") return;
    const name = (node.name || node.tagName || "").toLowerCase();
    if (!name) return;
    // First occurrence wins (matches Google Merchant single-value semantics).
    if (fields[name] !== undefined) return;
    fields[name] = $(child).text().trim();
  });
  return fields;
}

/**
 * Pure XML → RawListing[] parser. Pulled into a standalone function so the
 * unit tests can pin behaviour against the bundled fixture without ever
 * touching the network.
 *
 * Accepts the standard RSS 2.0 + `g:` namespace shape used by TRR's
 * affiliate feed (and by virtually every Google Merchant feed). Skips
 * entries that don't have the minimum viable fields, that name a
 * non-handbag category, or that are out of stock.
 */
export function parseTrrFeedXml(xml: string): RawListing[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: RawListing[] = [];
  const seen = new Set<string>();

  $("item").each((_, el) => {
    const f = readItemFields($, $(el));

    const externalId = f["g:id"] ?? f["id"] ?? "";
    if (!externalId || seen.has(externalId)) return;

    const availability = (f["g:availability"] ?? "").toLowerCase();
    if (availability && availability !== "in stock" && availability !== "in_stock") {
      return;
    }

    const title = decodeEntities(f["title"] ?? "");
    const link = f["link"] ?? "";
    const description = decodeEntities(f["description"] ?? "");
    const imageUrl = f["g:image_link"] ?? "";
    const brand = decodeEntities(f["g:brand"] ?? "");
    const productType = decodeEntities(f["g:product_type"] ?? "");
    const googleCategory = decodeEntities(f["g:google_product_category"] ?? "");
    const colorRaw = decodeEntities(f["g:color"] ?? "");
    const sizeRaw = decodeEntities(f["g:size"] ?? "");
    const conditionRaw = f["g:condition"] ?? "";

    if (!title || !brand || !imageUrl) return;
    if (!isHandbagEntry({ googleCategory, productType, title })) return;

    const priceMoney = parseMoney(f["g:price"] ?? "");
    if (!priceMoney) return;
    const saleMoney = parseMoney(f["g:sale_price"] ?? "");

    // When a sale price is present it is the actual offer; the regular
    // price becomes the "compare at" / original price for discount math.
    const price = saleMoney?.amount ?? priceMoney.amount;
    const originalPrice =
      saleMoney && saleMoney.amount < priceMoney.amount ? priceMoney.amount : undefined;

    const color = colorRaw || extractColor(title, "Multi");
    const size = sizeRaw || extractSize(title, "Medium");
    const condition = pickCondition(conditionRaw, description, title);

    const sourceUrl =
      link.startsWith("http")
        ? link
        : link
          ? `${BASE_URL}${link.startsWith("/") ? "" : "/"}${link}`
          : `${BASE_URL}/products/${externalId}`;

    seen.add(externalId);
    out.push({
      externalId,
      title,
      brand,
      model: null,
      style: null,
      color,
      size,
      condition,
      price,
      originalPrice,
      currency: priceMoney.currency,
      imageUrl,
      description: description || undefined,
      sourceUrl,
    });
  });

  return out;
}

/**
 * Resolve the feed bytes for one ingest cycle. Order of precedence:
 *   1. TRR_FEED_URL                — live partner feed (production path).
 *   2. TRR_FEED_FIXTURE_PATH       — operator-supplied local file.
 *   3. Bundled fixture             — only outside production.
 * Returns the XML as a string. Throws when no source is available so the
 * ingest layer surfaces the misconfiguration via the source's degraded
 * state instead of silently returning zero listings.
 */
async function loadFeedXml(): Promise<string> {
  const feedUrl = process.env[FEED_URL_ENV]?.trim();
  if (feedUrl) {
    await limiter.acquire();
    const xml = await httpFetch<string>(feedUrl, "html", {
      asBrowser: false,
      timeoutMs: 30_000,
      retries: 3,
      backoffMs: 1000,
      headers: { Accept: "application/xml,text/xml,*/*;q=0.9" },
      context: { source: SOURCE_SLUG, kind: "feed" },
    });
    if (!xml) {
      throw new Error(
        `TheRealReal: ${FEED_URL_ENV} returned an empty response (${feedUrl}).`,
      );
    }
    return xml;
  }

  const overridePath = process.env[FEED_FIXTURE_PATH_ENV]?.trim();
  if (overridePath) {
    return fs.readFile(overridePath, "utf8");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `TheRealReal: no partner feed configured. Set ${FEED_URL_ENV} to the affiliate XML feed URL (Google Merchant format) supplied by The RealReal's partner program.`,
    );
  }

  // Dev / test: serve the bundled fixture so listings keep flowing locally.
  return fs.readFile(BUNDLED_FIXTURE_PATH, "utf8");
}

async function fetchListings(): Promise<RawListing[]> {
  const xml = await loadFeedXml();
  const listings = parseTrrFeedXml(xml);
  logger.info(
    {
      source: SOURCE_SLUG,
      count: listings.length,
      mode: process.env[FEED_URL_ENV] ? "live_feed" : "fixture",
    },
    "therealreal: feed parse complete",
  );
  return listings;
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
