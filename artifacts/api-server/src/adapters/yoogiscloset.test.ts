import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultNormalize, defaultValidate } from "./base";
import { parseYoogisListingHtml } from "./yoogiscloset";

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
