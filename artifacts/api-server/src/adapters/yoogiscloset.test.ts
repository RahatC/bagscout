import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultNormalize, defaultValidate } from "./base";
import {
  parseYoogisGalleryHtml,
  parseYoogisListingHtml,
  toPrimaryProductImage,
} from "./yoogiscloset";

const FIXTURE_DIR = join(__dirname, "__fixtures__");

const html = readFileSync(
  join(FIXTURE_DIR, "yoogiscloset_handbags.html"),
  "utf8",
);

describe("parseYoogisListingHtml", () => {
  const listings = parseYoogisListingHtml(html, "chanel");

  it("extracts every product card from the fixture", () => {
    expect(listings.length).toBe(10);
  });

  it("captures id, brand, title, price, image and source URL for each card", () => {
    for (const l of listings) {
      expect(l.externalId).toMatch(/^\d{4,}$/);
      expect(l.brand.length).toBeGreaterThan(0);
      expect(l.title.length).toBeGreaterThan(5);
      expect(l.price).toBeGreaterThan(0);
      expect(l.imageUrl).toMatch(/^https:\/\/backend\.yoogiscloset\.com\/media/);
      expect(l.sourceUrl).toMatch(/^https:\/\/www\.yoogiscloset\.com\/\d+-/);
      expect(l.currency).toBe("USD");
    }
  });

  it("captures the strikethrough WAS price as originalPrice when higher", () => {
    const withDiscount = listings.filter((l) => l.originalPrice != null);
    expect(withDiscount.length).toBeGreaterThan(0);
    for (const l of withDiscount) {
      expect(l.originalPrice!).toBeGreaterThan(l.price);
    }
  });

  it("captures item condition from the microdata", () => {
    expect(listings.every((l) => l.condition.length > 0)).toBe(true);
    // Yoogi pre-owned cards say "Gently used" → "Very Good".
    expect(listings.some((l) => l.condition === "Very Good")).toBe(true);
  });

  it("returns an empty array for HTML with no product cards", () => {
    expect(parseYoogisListingHtml("<html><body>no listings</body></html>")).toEqual(
      [],
    );
  });

  it("rewrites styled grid-thumbnail variants to the product-only _01 shot", () => {
    const styled =
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_02.jpg?quality=80&bg-color=255,255,255&fit=bounds&height=416&width=312";
    expect(toPrimaryProductImage(styled)).toBe(
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_01.jpg?quality=80&bg-color=255,255,255&fit=bounds&height=416&width=312",
    );
    // Multi-digit variants collapse to _01 as well.
    expect(
      toPrimaryProductImage(
        "https://backend.yoogiscloset.com/media/catalog/product/5/7/577996_12.jpg",
      ),
    ).toBe("https://backend.yoogiscloset.com/media/catalog/product/5/7/577996_12.jpg".replace("_12", "_01"));
    // Already-primary and non-matching URLs are left untouched.
    const primary =
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_01.jpg";
    expect(toPrimaryProductImage(primary)).toBe(primary);
    expect(toPrimaryProductImage("https://example.com/photo.png")).toBe(
      "https://example.com/photo.png",
    );
  });

  it("extracts the full ordered product gallery from a product page", () => {
    // Mirrors Yoogi's product-page markup: gallery URLs are JSON-escaped
    // (\u002F for /) and listed out of order; cross-sell images for an
    // unrelated id appear too and must be excluded.
    const esc = (n: string) =>
      `"https:\\u002F\\u002Fbackend.yoogiscloset.com\\u002Fmedia\\u002Fcatalog\\u002Fproduct\\u002F6\\u002F9\\u002F698124_${n}.jpg"`;
    const productHtml = `<script>{"images":[${esc("03")},${esc("01")},${esc("02")},${esc("05")},${esc("04")}],` +
      `"related":["https:\\u002F\\u002Fbackend.yoogiscloset.com\\u002Fmedia\\u002Fcatalog\\u002Fproduct\\u002F1\\u002F2\\u002F123456_01.jpg"]}</script>`;
    const gallery = parseYoogisGalleryHtml(
      productHtml,
      "?quality=80&height=416&width=312",
    );
    expect(gallery).toEqual([
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_01.jpg?quality=80&height=416&width=312",
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_02.jpg?quality=80&height=416&width=312",
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_03.jpg?quality=80&height=416&width=312",
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_04.jpg?quality=80&height=416&width=312",
      "https://backend.yoogiscloset.com/media/catalog/product/6/9/698124_05.jpg?quality=80&height=416&width=312",
    ]);
  });

  it("returns an empty gallery when no catalog images are present", () => {
    expect(parseYoogisGalleryHtml("<html><body>nothing</body></html>")).toEqual([]);
  });

  it("normalises and validates a sample mapped product", () => {
    const baseUrl = "https://www.yoogiscloset.com";
    const normalized = defaultNormalize(listings[0], {
      source: "Yoogi's Closet",
      baseUrl,
    });
    expect(normalized.source).toBe("Yoogi's Closet");
    expect(normalized.normalizedBrand.length).toBeGreaterThan(0);
    expect(normalized.sourceUrl).toBe(listings[0].sourceUrl);
    expect(defaultValidate(normalized).valid).toBe(true);
  });
});
