import * as cheerio from "cheerio";
import { logger } from "../lib/logger";
import {
  createMockAdapter,
  defaultNormalize,
  defaultValidate,
  shouldUseMockAdapters,
} from "./base";
import { httpFetch, RateLimiter } from "./http";
import { decodeEntities, extractCondition, extractSize, parsePrice } from "./parse";
import type { RawListing, SourceAdapter } from "./types";

const SOURCE_NAME = "Yoogi's Closet";
const SOURCE_SLUG = "yoogiscloset";
const BASE_URL = "https://www.yoogiscloset.com";

const limiter = new RateLimiter(2000);

// Brand-bucketed handbag listing pages. Each is a server-rendered HTML page
// (Nuxt SSR) that includes a microdata-marked grid of product cards. Limited
// to the high-signal designer brands the matcher cares about.
const BRAND_LISTING_PATHS = [
  "/handbags/chanel",
  "/handbags/louis-vuitton",
  "/handbags/hermes",
  "/handbags/gucci",
  "/handbags/celine",
  "/handbags/dior",
  "/handbags/saint-laurent",
  "/handbags/prada",
  "/handbags/bottega-veneta",
  "/handbags/fendi",
  "/handbags/loewe",
  "/handbags/goyard",
];

// Yoogi's listings carry a numeric leading id like
// `/475190-chanel-...-bag.html`. Capture id + slug.
const PRODUCT_HREF_RE = /^\/(\d{4,})-([a-z0-9-]+)\.html$/i;

/**
 * Yoogi's product images follow a numbered convention
 * (`<id>_01.jpg`, `<id>_02.jpg`, ...). `_01` is the standardized product-only
 * catalog shot (bag on a white background); the listing-grid thumbnail instead
 * points at an alternate variant (commonly `_02`, a styled / on-model shot).
 * Rewrite any numbered variant to `_01` so the stored primary image is the
 * product itself — matching the first image shown on the source product page.
 */
export function toPrimaryProductImage(url: string): string {
  return url.replace(/_\d+(\.jpg)/i, "_01$1");
}

const GALLERY_IMAGE_RE =
  /https:\/\/backend\.yoogiscloset\.com\/media\/catalog\/product\/[a-z0-9]\/[a-z0-9]\/(\d+)_(\d+)\.jpg/gi;

/**
 * Parse the full ordered image gallery out of a Yoogi's product page.
 *
 * The product page embeds its gallery as a JSON array of `\u002F`-escaped URLs
 * (`<id>_01.jpg`, `<id>_02.jpg`, ...). We decode the escaping, collect every
 * distinct catalog image for the page's dominant product id, and return them
 * ordered by their numeric suffix so the `_01` product-only shot is first and
 * the remaining angles / detail / styled shots follow.
 *
 * `sizeQuery` (e.g. `?quality=80&...&width=312`) is appended to each URL so the
 * gallery renders at the same dimensions as the grid thumbnail.
 *
 * Pure function: takes raw HTML so the test suite can run on a fixture without
 * any network calls. Returns `[]` when no gallery is found.
 */
export function parseYoogisGalleryHtml(html: string, sizeQuery = ""): string[] {
  const decoded = html.split("\\u002F").join("/");
  const byUrl = new Map<string, { url: string; id: string; n: number }>();
  for (const m of decoded.matchAll(GALLERY_IMAGE_RE)) {
    const url = m[0];
    if (!byUrl.has(url)) {
      byUrl.set(url, { url, id: m[1], n: Number.parseInt(m[2], 10) });
    }
  }
  const all = [...byUrl.values()];
  if (all.length === 0) return [];

  // A product page can reference unrelated ids (cross-sells, recently viewed).
  // Keep only images for the id with the most images — the listing's own set.
  const counts = new Map<string, number>();
  for (const x of all) counts.set(x.id, (counts.get(x.id) ?? 0) + 1);
  let mainId = all[0].id;
  let best = 0;
  for (const [id, c] of counts) {
    if (c > best) {
      best = c;
      mainId = id;
    }
  }

  return all
    .filter((x) => x.id === mainId)
    .sort((a, b) => a.n - b.n)
    .map((x) => x.url + sizeQuery);
}

/** Extract the `?...` size/transform query from a Yoogi's image URL, if any. */
function imageSizeQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? "" : url.slice(i);
}

/**
 * Parse one HTML listing page (e.g. `/handbags/chanel`) into RawListings.
 * Pulled into its own pure function so the parser test suite can run on a
 * captured fixture without making any network calls.
 */
export function parseYoogisListingHtml(html: string, brandHint?: string): RawListing[] {
  const $ = cheerio.load(html);
  const out: RawListing[] = [];

  $('div[itemtype="https://schema.org/Product"]').each((_, el) => {
    const $card = $(el);

    const $link = $card.find("a[href]").first();
    const href = $link.attr("href") ?? "";
    const m = PRODUCT_HREF_RE.exec(href);
    if (!m) return;
    const externalId = m[1];

    const linkTitle = decodeEntities(($link.attr("title") ?? "").trim());
    const namePart = decodeEntities($card.find('[itemprop="name"]').first().text().trim());
    const brandFromCard = decodeEntities(
      $card.find('[itemprop="brand"]').first().text().trim(),
    );
    const brand = brandFromCard || brandHint || "";

    // Title strategy: brand + name (e.g. "Chanel Beige Chevron Quilted ... Boy Bag").
    const title = (brand ? `${brand} ${namePart || linkTitle}` : namePart || linkTitle)
      .replace(/\s+/g, " ")
      .trim();
    if (!title) return;

    // Current price lives in <span itemprop="price" content="3420">.
    const priceMeta = $card.find('[itemprop="price"]').first().attr("content");
    const priceText = $card.find('[itemprop="price"]').first().text().trim();
    const price = parsePrice(priceMeta ?? priceText);
    if (!price) return;

    // "WAS" original price — find a strikethrough span.
    const originalText = $card.find(".line-through").first().text().trim();
    const originalPrice = parsePrice(originalText) ?? undefined;
    const usableOriginalPrice =
      originalPrice && originalPrice > price ? originalPrice : undefined;

    // Image URL — primary src is in `data-src` (lazy load). The grid thumb
    // points at a styled alternate; normalize to the `_01` product-only shot.
    const $img = $card.find("img").first();
    const rawImageUrl = ($img.attr("data-src") ?? $img.attr("src") ?? "").trim();
    if (!rawImageUrl) return;
    const imageUrl = toPrimaryProductImage(rawImageUrl);

    const conditionText = $card.find('[itemprop="itemCondition"]').first().text().trim();
    const condition = extractCondition(conditionText, "Very Good");

    const colorFromTitle = (() => {
      // YC titles start with "<Brand> <Color words> <Material> <Style>".
      // Heuristic: the first 1-2 words after brand are usually the color.
      const t = (namePart || linkTitle).toLowerCase();
      const match = t.match(/^\s*([a-z]+(?:\s+[a-z]+)?)/);
      return match ? match[1] : "";
    })();

    out.push({
      externalId,
      title,
      brand,
      model: null,
      style: null,
      color: colorFromTitle,
      size: extractSize(title, "Medium"),
      condition,
      price,
      originalPrice: usableOriginalPrice,
      currency: "USD",
      imageUrl,
      sourceUrl: `${BASE_URL}${href}`,
    });
  });

  return out;
}

async function fetchListings(): Promise<RawListing[]> {
  const seen = new Set<string>();
  const all: RawListing[] = [];
  for (const path of BRAND_LISTING_PATHS) {
    await limiter.acquire();
    let html: string | null = null;
    try {
      html = await httpFetch<string>(`${BASE_URL}${path}`, "html", {
        asBrowser: true,
        timeoutMs: 20_000,
        retries: 3,
        backoffMs: 1000,
        context: { source: SOURCE_SLUG, path },
      });
    } catch (err) {
      logger.warn(
        { err, source: SOURCE_SLUG, path },
        "yoogiscloset: listing page fetch failed, skipping",
      );
      continue;
    }
    if (!html) continue;

    const brandHint = path.split("/").pop()?.replace(/-/g, " ");
    const listings = parseYoogisListingHtml(html, brandHint);
    for (const l of listings) {
      if (seen.has(l.externalId)) continue;
      seen.add(l.externalId);
      all.push(l);
    }
  }

  // Enrich each listing with its full image gallery. The grid card only exposes
  // a single thumbnail; the per-product page carries the ordered `_01.._NN`
  // gallery. Fetch each product page (rate-limited) and populate `imageUrls`.
  for (const l of all) {
    if (!l.sourceUrl) continue;
    await limiter.acquire();
    try {
      const productHtml = await httpFetch<string>(l.sourceUrl, "html", {
        asBrowser: true,
        timeoutMs: 20_000,
        retries: 2,
        backoffMs: 1000,
        context: { source: SOURCE_SLUG, productId: l.externalId },
      });
      if (!productHtml) continue;
      const gallery = parseYoogisGalleryHtml(productHtml, imageSizeQuery(l.imageUrl));
      if (gallery.length > 1) {
        l.imageUrls = gallery;
        l.imageUrl = gallery[0];
      }
    } catch (err) {
      logger.warn(
        { err, source: SOURCE_SLUG, productId: l.externalId },
        "yoogiscloset: product gallery fetch failed, keeping single image",
      );
    }
  }

  logger.info({ source: SOURCE_SLUG, count: all.length }, "yoogiscloset: fetch complete");
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
    externalId: "yc-mock-001",
    title: "Louis Vuitton Speedy Bandouliere 25 Damier Ebene",
    brand: "Louis Vuitton",
    model: "Speedy",
    style: "Top Handle",
    color: "Brown",
    size: "Speedy 25",
    condition: "Very Good",
    price: 1750,
    imageUrl: "https://images.unsplash.com/photo-1606522754091-a3bbf9ad4cb3?w=800",
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
