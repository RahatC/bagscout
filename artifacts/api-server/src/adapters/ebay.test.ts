import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapEbayItem,
  ebayCredentialsConfigured,
  ebayLiveAdapter,
  __setEbayFetch,
  __resetEbayState,
  __getApplicationToken,
} from "./ebay";

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

describe("ebay adapter — OAuth token flow", () => {
  let origAppId: string | undefined;
  let origCertId: string | undefined;

  beforeEach(() => {
    origAppId = process.env.EBAY_APP_ID;
    origCertId = process.env.EBAY_CERT_ID;
    __resetEbayState();
  });
  afterEach(() => {
    if (origAppId === undefined) delete process.env.EBAY_APP_ID;
    else process.env.EBAY_APP_ID = origAppId;
    if (origCertId === undefined) delete process.env.EBAY_CERT_ID;
    else process.env.EBAY_CERT_ID = origCertId;
    __setEbayFetch(null);
    __resetEbayState();
  });

  it("POSTs form body with Basic auth and parses access_token", async () => {
    process.env.EBAY_APP_ID = "myAppId";
    process.env.EBAY_CERT_ID = "myCertId";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/identity/v1/oauth2/token");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      const expectedBasic =
        "Basic " + Buffer.from("myAppId:myCertId").toString("base64");
      expect(headers.Authorization).toBe(expectedBasic);
      expect(String(init?.body)).toContain("grant_type=client_credentials");
      expect(String(init?.body)).toContain("scope=");
      return new Response(
        JSON.stringify({ access_token: "tok-123", expires_in: 7200, token_type: "Application Access Token" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    __setEbayFetch(fetchMock as unknown as typeof fetch);
    const token = await __getApplicationToken();
    expect(token).toBe("tok-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches the token and does not re-POST on the next call", async () => {
    process.env.EBAY_APP_ID = "a";
    process.env.EBAY_CERT_ID = "b";
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: "cached", expires_in: 7200, token_type: "x" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    __setEbayFetch(fetchMock as unknown as typeof fetch);
    const t1 = await __getApplicationToken();
    const t2 = await __getApplicationToken();
    expect(t1).toBe("cached");
    expect(t2).toBe("cached");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a descriptive error on non-2xx token response", async () => {
    process.env.EBAY_APP_ID = "a";
    process.env.EBAY_CERT_ID = "b";
    __setEbayFetch(
      (async () =>
        new Response("invalid_client", { status: 401 })) as unknown as typeof fetch,
    );
    await expect(__getApplicationToken()).rejects.toThrow(/401/);
  });

  it("throws when access_token is missing in the response", async () => {
    process.env.EBAY_APP_ID = "a";
    process.env.EBAY_CERT_ID = "b";
    __setEbayFetch(
      (async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch,
    );
    await expect(__getApplicationToken()).rejects.toThrow(/no access_token/);
  });

  it("throws when credentials are absent (defensive — fetchListings is the user-facing guard)", async () => {
    delete process.env.EBAY_APP_ID;
    delete process.env.EBAY_CERT_ID;
    await expect(__getApplicationToken()).rejects.toThrow(/EBAY_APP_ID/);
  });
});

describe("ebay adapter — fetchListings missing-creds no-op", () => {
  let origAppId: string | undefined;
  let origCertId: string | undefined;
  beforeEach(() => {
    origAppId = process.env.EBAY_APP_ID;
    origCertId = process.env.EBAY_CERT_ID;
    delete process.env.EBAY_APP_ID;
    delete process.env.EBAY_CERT_ID;
    __resetEbayState();
  });
  afterEach(() => {
    if (origAppId === undefined) delete process.env.EBAY_APP_ID;
    else process.env.EBAY_APP_ID = origAppId;
    if (origCertId === undefined) delete process.env.EBAY_CERT_ID;
    else process.env.EBAY_CERT_ID = origCertId;
    __resetEbayState();
  });

  it("returns [] without throwing and does not call fetch when EBAY creds are absent", async () => {
    const fetchMock = vi.fn();
    __setEbayFetch(fetchMock as unknown as typeof fetch);
    const listings = await ebayLiveAdapter.fetchListings();
    expect(listings).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    __setEbayFetch(null);
  });
});
