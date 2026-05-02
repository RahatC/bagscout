import { describe, expect, it } from "vitest";
import { parseTrrListingHtml } from "./therealreal";

const PX_CAPTCHA = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Access to this page has been denied</title><meta name="description" content="px-captcha"></head><body><script>window._pxAppId='PXev56mY37'</script></body></html>`;

const SYNTHETIC_LISTING_HTML = `
<!doctype html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": [
    {
      "@type": "Product",
      "productID": "trr-12345",
      "name": "Chanel Medium Classic Flap Black Caviar GHW",
      "brand": { "@type": "Brand", "name": "Chanel" },
      "image": ["https://www.therealreal.com/products/trr-12345.jpg"],
      "url": "https://www.therealreal.com/products/chanel-medium-classic-flap-12345",
      "offers": { "@type": "Offer", "price": "4995.00", "priceCurrency": "USD" },
      "itemCondition": "Excellent"
    },
    {
      "@type": "Product",
      "sku": "trr-67890",
      "name": "Hermès Kelly 28 Sellier Gold Epsom",
      "brand": "Hermès",
      "image": "https://www.therealreal.com/products/trr-67890.jpg",
      "url": "https://www.therealreal.com/products/hermes-kelly-67890",
      "offers": { "price": 21500, "priceCurrency": "USD" },
      "itemCondition": "Pristine",
      "color": "Gold"
    }
  ]
}
</script>
</head><body><div>listings</div></body></html>
`;

describe("parseTrrListingHtml", () => {
  it("returns an empty array for the PerimeterX captcha page", () => {
    expect(parseTrrListingHtml(PX_CAPTCHA)).toEqual([]);
  });

  it("extracts products from JSON-LD ItemList markup", () => {
    const out = parseTrrListingHtml(SYNTHETIC_LISTING_HTML);
    expect(out).toHaveLength(2);

    const chanel = out.find((l) => l.externalId === "trr-12345");
    expect(chanel).toBeDefined();
    expect(chanel?.title).toContain("Chanel");
    expect(chanel?.brand).toBe("Chanel");
    expect(chanel?.price).toBe(4995);
    expect(chanel?.imageUrl).toMatch(/^https:\/\/www\.therealreal\.com/);
    expect(chanel?.sourceUrl).toMatch(/\/products\/chanel-medium/);
    expect(chanel?.condition).toBe("Excellent");

    const hermes = out.find((l) => l.externalId === "trr-67890");
    expect(hermes).toBeDefined();
    expect(hermes?.brand).toBe("Hermès");
    expect(hermes?.price).toBe(21500);
    expect(hermes?.color).toBe("Gold");
    expect(hermes?.size).toBe("Kelly 28");
  });

  it("returns an empty array when the page has no JSON-LD or product anchors", () => {
    expect(parseTrrListingHtml("<html><body><h1>nothing here</h1></body></html>")).toEqual(
      [],
    );
  });
});
