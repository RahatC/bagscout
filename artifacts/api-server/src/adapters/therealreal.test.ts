import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTrrFeedXml } from "./therealreal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "__fixtures__", "therealreal_feed.xml");
const FIXTURE_XML = readFileSync(FIXTURE_PATH, "utf8");

const SYNTHETIC_TWO_ITEM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>TRR test</title>
    <link>https://www.therealreal.com</link>
    <description>test</description>
    <item>
      <g:id>trr-12345</g:id>
      <title>Chanel Medium Classic Flap Black Caviar GHW</title>
      <link>https://www.therealreal.com/products/chanel-medium-classic-flap-12345</link>
      <description>Pre-owned, condition Excellent.</description>
      <g:image_link>https://img.therealreal.com/trr-12345.jpg</g:image_link>
      <g:price>5495.00 USD</g:price>
      <g:sale_price>4995.00 USD</g:sale_price>
      <g:availability>in stock</g:availability>
      <g:condition>used</g:condition>
      <g:brand>Chanel</g:brand>
      <g:google_product_category>Apparel &amp; Accessories &gt; Handbags, Wallets &amp; Cases &gt; Handbags</g:google_product_category>
      <g:product_type>Women &gt; Handbags &gt; Shoulder Bag</g:product_type>
      <g:color>Black</g:color>
      <g:size>Medium</g:size>
    </item>
    <item>
      <g:id>trr-67890</g:id>
      <title>Hermès Kelly 28 Sellier Gold Epsom GHW</title>
      <link>https://www.therealreal.com/products/hermes-kelly-67890</link>
      <description>Pristine condition Hermes Kelly 28.</description>
      <g:image_link>https://img.therealreal.com/trr-67890.jpg</g:image_link>
      <g:price>21500 USD</g:price>
      <g:availability>in stock</g:availability>
      <g:condition>used</g:condition>
      <g:brand>Hermès</g:brand>
      <g:google_product_category>Apparel &amp; Accessories &gt; Handbags, Wallets &amp; Cases &gt; Handbags</g:google_product_category>
      <g:product_type>Women &gt; Handbags &gt; Top Handle</g:product_type>
      <g:color>Gold</g:color>
      <g:size>Kelly 28</g:size>
    </item>
    <item>
      <g:id>trr-out-of-stock</g:id>
      <title>Hermès Birkin 30 Etoupe</title>
      <link>https://www.therealreal.com/products/hermes-birkin-oos</link>
      <g:image_link>https://img.therealreal.com/trr-oos.jpg</g:image_link>
      <g:price>18000.00 USD</g:price>
      <g:availability>out of stock</g:availability>
      <g:condition>used</g:condition>
      <g:brand>Hermès</g:brand>
      <g:google_product_category>Apparel &amp; Accessories &gt; Handbags, Wallets &amp; Cases &gt; Handbags</g:google_product_category>
      <g:product_type>Women &gt; Handbags &gt; Top Handle</g:product_type>
      <g:color>Etoupe</g:color>
      <g:size>30cm</g:size>
    </item>
    <item>
      <g:id>trr-not-a-bag</g:id>
      <title>Hermès Twilly Silk Scarf</title>
      <link>https://www.therealreal.com/products/hermes-twilly</link>
      <g:image_link>https://img.therealreal.com/twilly.jpg</g:image_link>
      <g:price>180.00 USD</g:price>
      <g:availability>in stock</g:availability>
      <g:condition>used</g:condition>
      <g:brand>Hermès</g:brand>
      <g:google_product_category>Apparel &amp; Accessories &gt; Clothing Accessories &gt; Scarves &amp; Shawls</g:google_product_category>
      <g:product_type>Women &gt; Accessories &gt; Scarves</g:product_type>
      <g:color>Multi</g:color>
      <g:size>One Size</g:size>
    </item>
  </channel>
</rss>`;

describe("parseTrrFeedXml", () => {
  it("extracts handbags from a Google Merchant XML feed", () => {
    const out = parseTrrFeedXml(SYNTHETIC_TWO_ITEM_FEED);
    expect(out).toHaveLength(2);

    const chanel = out.find((l) => l.externalId === "trr-12345");
    expect(chanel).toBeDefined();
    expect(chanel?.title).toContain("Chanel");
    expect(chanel?.brand).toBe("Chanel");
    // Sale price wins over the regular price; regular price is captured
    // as the original for discount math.
    expect(chanel?.price).toBe(4995);
    expect(chanel?.originalPrice).toBe(5495);
    expect(chanel?.imageUrl).toBe("https://img.therealreal.com/trr-12345.jpg");
    expect(chanel?.sourceUrl).toMatch(/\/products\/chanel-medium-classic-flap-12345$/);
    expect(chanel?.color).toBe("Black");
    expect(chanel?.condition).toBe("Excellent");

    const hermes = out.find((l) => l.externalId === "trr-67890");
    expect(hermes).toBeDefined();
    expect(hermes?.brand).toBe("Hermès");
    expect(hermes?.price).toBe(21500);
    expect(hermes?.originalPrice).toBeUndefined();
    expect(hermes?.color).toBe("Gold");
    expect(hermes?.size).toBe("Kelly 28");
    expect(hermes?.condition).toBe("Pristine");
  });

  it("skips out-of-stock and non-handbag entries", () => {
    const out = parseTrrFeedXml(SYNTHETIC_TWO_ITEM_FEED);
    expect(out.find((l) => l.externalId === "trr-out-of-stock")).toBeUndefined();
    expect(out.find((l) => l.externalId === "trr-not-a-bag")).toBeUndefined();
  });

  it("returns an empty array for malformed / non-feed XML", () => {
    expect(parseTrrFeedXml("<html><body>nope</body></html>")).toEqual([]);
    expect(parseTrrFeedXml("")).toEqual([]);
  });

  it("parses the bundled TRR partner-feed fixture and yields ≥100 handbag listings", () => {
    const listings = parseTrrFeedXml(FIXTURE_XML);
    // Ingest target from the task brief: ≥100 listings per cycle.
    expect(listings.length).toBeGreaterThanOrEqual(100);

    // No duplicate externalIds.
    const ids = new Set<string>();
    for (const l of listings) {
      expect(ids.has(l.externalId)).toBe(false);
      ids.add(l.externalId);
    }

    // Every entry has the minimum fields the validator requires.
    for (const l of listings) {
      expect(l.externalId).toBeTruthy();
      expect(l.title).toBeTruthy();
      expect(l.brand).toBeTruthy();
      expect(l.imageUrl).toMatch(/^https?:\/\//);
      expect(l.price).toBeGreaterThan(0);
      expect(l.sourceUrl).toMatch(/^https?:\/\//);
    }

    // The fixture's two non-handbag noise rows must not leak through.
    expect(listings.find((l) => l.externalId === "trr-9999801")).toBeUndefined();
    expect(listings.find((l) => l.externalId === "trr-9999802")).toBeUndefined();

    // Brand coverage check — TRR's value to BagScout is unique inventory
    // across Hermès, Chanel and other top brands, so make sure each shows up.
    const brands = new Set(listings.map((l) => l.brand));
    expect(brands.has("Hermès")).toBe(true);
    expect(brands.has("Chanel")).toBe(true);
    expect(brands.has("Louis Vuitton")).toBe(true);
  });
});
