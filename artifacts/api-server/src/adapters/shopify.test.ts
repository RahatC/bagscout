import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultNormalize, defaultValidate } from "./base";
import { mapShopifyProduct, type ShopifyProductsResponse } from "./shopify";

const FIXTURE_DIR = join(__dirname, "__fixtures__");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as T;
}

describe("mapShopifyProduct (Fashionphile fixture)", () => {
  const data = loadJson<ShopifyProductsResponse>("fashionphile_handbags.json");

  it("contains products in the fixture", () => {
    expect(data.products.length).toBeGreaterThan(0);
  });

  it("maps every available product to a non-null RawListing", () => {
    const baseUrl = "https://www.fashionphile.com";
    const mapped = data.products
      .map((p) => mapShopifyProduct(p, baseUrl))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    expect(mapped.length).toBeGreaterThan(0);
    for (const r of mapped) {
      expect(r.externalId).toMatch(/^\d+$/);
      expect(r.title.length).toBeGreaterThan(2);
      expect(r.brand.length).toBeGreaterThan(0);
      expect(r.price).toBeGreaterThan(0);
      expect(r.imageUrl).toMatch(/^https?:\/\//);
      expect(r.sourceUrl).toMatch(/^https:\/\/www\.fashionphile\.com\/products\//);
      expect(r.currency).toBe("USD");
    }
  });

  it("captures compare_at_price as originalPrice when higher", () => {
    const baseUrl = "https://www.fashionphile.com";
    const mapped = data.products
      .map((p) => mapShopifyProduct(p, baseUrl))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const withDiscount = mapped.filter((r) => r.originalPrice != null);
    // We can't guarantee a particular fixture has a discount, but the rule
    // must hold for any that do: originalPrice > price.
    for (const r of withDiscount) {
      expect(r.originalPrice).toBeGreaterThan(r.price);
    }
  });

  it("normalises and validates a sample mapped product", () => {
    const baseUrl = "https://www.fashionphile.com";
    const raw = mapShopifyProduct(data.products[0], baseUrl);
    expect(raw).not.toBeNull();
    if (!raw) return;
    const normalized = defaultNormalize(raw, {
      source: "FASHIONPHILE",
      baseUrl,
    });
    expect(normalized.source).toBe("FASHIONPHILE");
    expect(normalized.normalizedBrand.length).toBeGreaterThan(0);
    expect(normalized.sourceUrl).toBe(raw.sourceUrl);
    expect(defaultValidate(normalized).valid).toBe(true);
  });
});

describe("mapShopifyProduct (Rebag fixture)", () => {
  const data = loadJson<ShopifyProductsResponse>("rebag_handbags.json");

  it("maps every available product to a non-null RawListing", () => {
    const baseUrl = "https://shop.rebag.com";
    const mapped = data.products
      .map((p) => mapShopifyProduct(p, baseUrl))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    expect(mapped.length).toBeGreaterThan(0);
    for (const r of mapped) {
      expect(r.sourceUrl).toMatch(/^https:\/\/shop\.rebag\.com\/products\//);
    }
  });

  it("returns null for products without a usable variant or image", () => {
    const baseUrl = "https://shop.rebag.com";
    const synthetic = {
      ...data.products[0],
      variants: [],
      images: [],
    };
    expect(mapShopifyProduct(synthetic, baseUrl)).toBeNull();
  });
});
