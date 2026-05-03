import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapEbayItem, ebayCredentialsConfigured } from "./ebay";

describe("ebay adapter — mapEbayItem", () => {
  it("maps a complete eBay item summary into a RawListing", () => {
    const raw = mapEbayItem({
      itemId: "v1|123|0",
      title: "Hermes Birkin 30 Etoupe Togo PHW",
      price: { value: "18500.00", currency: "USD" },
      itemWebUrl: "https://www.ebay.com/itm/123",
      image: { imageUrl: "https://i.ebayimg.com/x.jpg" },
      condition: "Pre-Owned",
      conditionId: "2030",
      shortDescription: "Authentic Birkin in like-new condition",
      marketingPrice: {
        originalPrice: { value: "21000.00", currency: "USD" },
      },
    });
    expect(raw).not.toBeNull();
    expect(raw!.externalId).toBe("v1|123|0");
    expect(raw!.title).toBe("Hermes Birkin 30 Etoupe Togo PHW");
    expect(raw!.brand).toBe("Hermes Birkin"); // first-2-tokens heuristic
    expect(raw!.price).toBe(18500);
    expect(raw!.originalPrice).toBe(21000);
    expect(raw!.condition).toBe("Excellent"); // 2030 → Excellent
    expect(raw!.imageUrl).toBe("https://i.ebayimg.com/x.jpg");
    expect(raw!.sourceUrl).toBe("https://www.ebay.com/itm/123");
    expect(raw!.currency).toBe("USD");
  });

  it("falls back to thumbnailImages[0] when image is absent", () => {
    const raw = mapEbayItem({
      itemId: "v1|999|0",
      title: "Chanel Classic Flap",
      price: { value: "6500", currency: "USD" },
      thumbnailImages: [{ imageUrl: "https://i.ebayimg.com/thumb.jpg" }],
      conditionId: "3000",
    });
    expect(raw).not.toBeNull();
    expect(raw!.imageUrl).toBe("https://i.ebayimg.com/thumb.jpg");
    expect(raw!.condition).toBe("Very Good"); // 3000 → Very Good
  });

  it("returns null when price is missing or non-positive", () => {
    expect(
      mapEbayItem({
        itemId: "x",
        title: "x",
        image: { imageUrl: "https://x" },
      }),
    ).toBeNull();
    expect(
      mapEbayItem({
        itemId: "x",
        title: "x",
        price: { value: "0", currency: "USD" },
        image: { imageUrl: "https://x" },
      }),
    ).toBeNull();
  });

  it("returns null when image is missing", () => {
    expect(
      mapEbayItem({
        itemId: "x",
        title: "x",
        price: { value: "100", currency: "USD" },
      }),
    ).toBeNull();
  });

  it("ignores marketing originalPrice that is not strictly higher than price", () => {
    const raw = mapEbayItem({
      itemId: "v1|321|0",
      title: "LV Speedy",
      price: { value: "1500", currency: "USD" },
      image: { imageUrl: "https://x" },
      conditionId: "4000",
      marketingPrice: { originalPrice: { value: "1500", currency: "USD" } },
    });
    expect(raw!.originalPrice).toBeUndefined();
    expect(raw!.condition).toBe("Good"); // 4000 → Good
  });

  it("maps conditionId 1000-1750 to New with Tags", () => {
    for (const id of ["1000", "1500", "1750"]) {
      const raw = mapEbayItem({
        itemId: `v|${id}`,
        title: "x",
        price: { value: "500", currency: "USD" },
        image: { imageUrl: "https://x" },
        conditionId: id,
      });
      expect(raw!.condition).toBe("New with Tags");
    }
  });

  it("falls back to free-text condition when conditionId is unknown", () => {
    const raw = mapEbayItem({
      itemId: "v|x",
      title: "x",
      price: { value: "500", currency: "USD" },
      image: { imageUrl: "https://x" },
      condition: "Like New",
    });
    expect(raw!.condition).toBe("Pristine");
  });
});

describe("ebay adapter — ebayCredentialsConfigured", () => {
  let origAppId: string | undefined;
  let origCertId: string | undefined;
  beforeEach(() => {
    origAppId = process.env.EBAY_APP_ID;
    origCertId = process.env.EBAY_CERT_ID;
    delete process.env.EBAY_APP_ID;
    delete process.env.EBAY_CERT_ID;
  });
  afterEach(() => {
    if (origAppId === undefined) delete process.env.EBAY_APP_ID;
    else process.env.EBAY_APP_ID = origAppId;
    if (origCertId === undefined) delete process.env.EBAY_CERT_ID;
    else process.env.EBAY_CERT_ID = origCertId;
  });

  it("returns false when either credential is missing", () => {
    expect(ebayCredentialsConfigured()).toBe(false);
    process.env.EBAY_APP_ID = "x";
    expect(ebayCredentialsConfigured()).toBe(false);
    delete process.env.EBAY_APP_ID;
    process.env.EBAY_CERT_ID = "y";
    expect(ebayCredentialsConfigured()).toBe(false);
  });

  it("returns true when both credentials are set", () => {
    process.env.EBAY_APP_ID = "x";
    process.env.EBAY_CERT_ID = "y";
    expect(ebayCredentialsConfigured()).toBe(true);
  });
});
