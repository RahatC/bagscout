import { httpFetch } from "./http";
import { extractColor, extractSize, extractCondition, stripHtml } from "./parse";
import type { RawListing } from "./types";

/**
 * Shared Shopify-storefront scraper.
 *
 * Both Fashionphile (fashionphile.com) and Rebag (shop.rebag.com) run
 * Shopify storefronts that expose a stable, well-known JSON endpoint at
 * `/collections/<handle>/products.json`. The endpoint paginates with
 * `?limit=&page=`, returns up to 250 products per page, and is the
 * preferred ingestion surface for Shopify-backed marketplaces.
 *
 * Documentation reference (Shopify): a JSON product feed is exposed by
 * default for every collection. We deliberately use modest pagination and
 * a low per-source rate limit to be a polite consumer.
 */

export interface ShopifyVariant {
  id: number;
  title: string;
  available: boolean;
  price: string;
  compare_at_price: string | null;
  sku: string | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: { src: string }[];
  published_at: string | null;
}

export interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

/**
 * Heuristic to tell whether a marketplace title describes a handbag (vs.
 * accessories, jewelry, shoes, etc.). Shared by the Shopify adapters since
 * Shopify storefronts mix categories under generic collections like
 * "best-sellers" or "all".
 */
export function looksLikeBag(title: string, productType?: string): boolean {
  const text = `${productType ?? ""} ${title}`.toLowerCase();
  const drop = [
    // SLG / accessories
    "wallet", "card holder", "card case", "key pouch", "key holder",
    "coin purse", "passport", "agenda", "notebook",
    // Belts, straps, scarves, ties, sunglasses, watches
    "belt ", "belts", "scarf", "shawl", "stole", "tie ", "ties",
    "sunglass", "watch", "hat ", "hats", "cap ", "gloves",
    // Footwear
    "shoe", "sneaker", "pump", "boot", "loafer", "sandal", "slide", "espadrille", "mule",
    // Jewelry
    "ring ", "rings", "bracelet", "earring", "necklace", "pendant", "charm",
    "brooch", "pin ", "cufflink",
    // Apparel
    "dress", "shirt", "skirt", "pants", "jacket", "coat", "sweater",
    // Home / fragrance / misc
    "candle", "fragrance", "perfume", "tray", "blanket",
  ];
  for (const term of drop) {
    if (text.includes(term)) {
      // Allow "belt bag" (a bag style) even though "belt" is dropped.
      if (term.startsWith("belt") && /belt\s+bag/.test(text)) continue;
      return false;
    }
  }
  return true;
}

/**
 * Convert one Shopify product into a `RawListing`. Returns null when the
 * product is unsellable (no available variants, missing price, no images).
 */
export function mapShopifyProduct(
  product: ShopifyProduct,
  baseUrl: string,
  productPathPrefix = "/products",
): RawListing | null {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0];
  if (!variant) return null;
  const price = Number(variant.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const compareAt = variant.compare_at_price ? Number(variant.compare_at_price) : NaN;
  const originalPrice =
    Number.isFinite(compareAt) && compareAt > price ? compareAt : undefined;

  // Most luxury Shopify storefronts (Fashionphile, Rebag) merchandise
  // bag-only product shots first and on-model / lifestyle shots later.
  // We prefer that natural order but additionally bias product-only shots
  // to the front when filenames hint at a model/lifestyle photo.
  const allImages = product.images
    .map((i) => i.src)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  if (allImages.length === 0) return null;

  const lifestyleHint = /(model|worn|lifestyle|outfit|editorial|on-?body|in-?use)/i;
  const productOnly = allImages.filter((u) => !lifestyleHint.test(u));
  const lifestyle = allImages.filter((u) => lifestyleHint.test(u));
  const orderedImages = productOnly.length > 0 ? [...productOnly, ...lifestyle] : allImages;
  const image = orderedImages[0];

  // Some merchandisers stuff the model and color into the title; fall back
  // to keyword-extraction so we still get usable normalized fields. Vendor
  // is typically the canonical brand.
  const brand = (product.vendor ?? "").trim();

  // Pull condition from tags or from the body — Rebag annotates tags like
  // "Condition_Excellent" while Fashionphile uses tags like "Condition: Pristine".
  const conditionTag = product.tags.find((t) =>
    /condition[\s:_-]/i.test(t),
  );
  const conditionFromTag = conditionTag
    ? conditionTag.replace(/^condition[\s:_-]+/i, "").trim()
    : null;
  const condition = extractCondition(
    conditionFromTag || stripHtml(product.body_html ?? "", 400) || "",
    "Good",
  );

  // Color: tag like "Color: Black" first, then title.
  const colorTag = product.tags.find((t) => /^color[\s:_-]/i.test(t));
  const colorFromTag = colorTag ? colorTag.replace(/^color[\s:_-]+/i, "").trim() : null;
  const color = colorFromTag || extractColor(product.title, "Multi");

  // Size: variant title is most reliable on Shopify, falls back to title.
  const variantSize =
    variant.title && variant.title.toLowerCase() !== "default title"
      ? variant.title
      : null;
  const size = variantSize || extractSize(product.title, "Medium");

  const sourceUrl = `${baseUrl.replace(/\/$/, "")}${productPathPrefix}/${product.handle}`;

  return {
    externalId: String(product.id),
    title: product.title.trim(),
    brand,
    model: null,
    style: null,
    color,
    size,
    condition,
    price,
    originalPrice,
    currency: "USD",
    imageUrl: image,
    imageUrls: orderedImages,
    description: stripHtml(product.body_html ?? "", 600) ?? undefined,
    sourceUrl,
  };
}

/**
 * Fetch one Shopify storefront page worth of products from the given
 * collection handle. Returns the parsed `RawListing` array. Empty when no
 * more products are available.
 */
export async function fetchShopifyCollectionPage(opts: {
  baseUrl: string;
  collectionHandle: string;
  page: number;
  limit?: number;
  source: string;
}): Promise<RawListing[]> {
  const limit = opts.limit ?? 50;
  const url = `${opts.baseUrl.replace(/\/$/, "")}/collections/${opts.collectionHandle}/products.json?limit=${limit}&page=${opts.page}`;
  const json = await httpFetch<ShopifyProductsResponse>(url, "json", {
    asBrowser: true,
    timeoutMs: 20_000,
    retries: 3,
    backoffMs: 800,
    context: { source: opts.source, page: opts.page },
  });
  if (!json || !Array.isArray(json.products)) return [];

  const out: RawListing[] = [];
  for (const product of json.products) {
    const listing = mapShopifyProduct(product, opts.baseUrl);
    if (listing) out.push(listing);
  }
  return out;
}
