import { describe, expect, it } from "vitest";
import { renderAlertEmail, buildAlertPreview, type AlertContext } from "./alertEmail";
import type {
  alertsTable,
  listingsTable,
  sourcesTable,
  bagPreferencesTable,
  matchResultsTable,
} from "@workspace/db";

type AlertRow = typeof alertsTable.$inferSelect;
type ListingRow = typeof listingsTable.$inferSelect;
type SourceRow = typeof sourcesTable.$inferSelect;
type PreferenceRow = typeof bagPreferencesTable.$inferSelect;
type MatchRow = typeof matchResultsTable.$inferSelect;

// Static context with a fixed createdAt so snapshots stay deterministic.
// We deliberately do NOT touch the DB here — alertEmail.ts is a pure renderer
// and we want this suite to run without any setup.
const FIXED_DATE = new Date("2026-01-15T12:00:00.000Z");

function makeContext(overrides: Partial<AlertContext> = {}): AlertContext {
  const alert: AlertRow = {
    id: 42,
    userId: "test_user_fixture",
    preferenceId: 7,
    listingId: 99,
    matchResultId: 5,
    alertType: "new_match",
    status: "pending",
    message: "Matches your watchlist criteria.",
    whyNow: "Newly listed in the last hour",
    priceAtAlert: "4800.00",
    conditionRankAtAlert: 3,
    availabilityAtAlert: "available",
    sentAt: null,
    digestSentAt: null,
    createdAt: FIXED_DATE,
  };

  const listing: ListingRow = {
    id: 99,
    sourceId: 1,
    sourceListingId: "snap-001",
    sourceUrl: "https://test.local/listing/snap-001",
    title: "Chanel Classic Flap Medium Black Caviar",
    brand: "Chanel",
    normalizedBrand: "chanel",
    model: "Classic Flap",
    normalizedModel: "classic flap",
    style: "Shoulder Bag",
    normalizedStyle: "shoulder bag",
    color: "Black",
    normalizedColor: "black",
    size: "Medium",
    normalizedSize: "medium",
    condition: "Excellent",
    normalizedCondition: "excellent",
    price: "4800.00",
    originalPrice: "5500.00",
    currency: "USD",
    description: "A pristine medium classic flap.",
    imageUrl: "https://test.local/img/snap.jpg",
    availabilityStatus: "available",
    listedAt: FIXED_DATE,
    lastSeenAt: FIXED_DATE,
    soldAt: null,
    sellerName: null,
    sellerLocation: null,
    qualityScore: null,
    extraData: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } as unknown as ListingRow;

  const source: SourceRow = {
    id: 1,
    slug: "test_source",
    name: "Test Source",
    baseUrl: "https://test.local",
    sourceType: "resale_marketplace",
    ingestionMode: "mock",
    complianceStatus: "approved",
    active: true,
    cadenceMinutes: 60,
    lastIngestAt: null,
    notes: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } as unknown as SourceRow;

  const preference: PreferenceRow = {
    id: 7,
    userId: "test_user_fixture",
    nickname: "My Chanel Watchlist",
    exactModelEnabled: false,
    modelQuery: null,
    conditionMinId: 3,
    allowCloseColorMatch: true,
    minPrice: null,
    maxPrice: "6000.00",
    onlyExactCriteria: false,
    allowCloseMatches: true,
    active: true,
    alertFrequency: "realtime",
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } as unknown as PreferenceRow;

  const match: MatchRow = {
    id: 5,
    userId: "test_user_fixture",
    preferenceId: 7,
    listingId: 99,
    matchScore: "0.920",
    matchType: "strong",
    matchExplanation: "Matched on brand, color, and size; price under your cap.",
    alertEligible: true,
    matchReasons: ["brand", "color", "size"],
    disqualifiers: [],
    createdAt: FIXED_DATE,
  } as unknown as MatchRow;

  return {
    alert,
    listing,
    source,
    preference,
    match,
    appOrigin: "https://bagscout.example.com",
    ...overrides,
  };
}

describe("renderAlertEmail — output shape", () => {
  it("subject + heading + text body match the new_match snapshot", () => {
    const out = renderAlertEmail(makeContext());
    expect(out.subject).toMatchInlineSnapshot(
      `"New match: Chanel Classic Flap"`,
    );
    expect(out.text).toMatchSnapshot();
  });

  it("html body matches snapshot (deterministic — no Date.now or random ids)", () => {
    const out = renderAlertEmail(makeContext());
    expect(out.html).toMatchSnapshot();
  });

  it("changes subject + heading per alertType", () => {
    const ctx = makeContext();
    const drop = renderAlertEmail({
      ...ctx,
      alert: { ...ctx.alert, alertType: "price_drop" },
    });
    const back = renderAlertEmail({
      ...ctx,
      alert: { ...ctx.alert, alertType: "back_in_stock" },
    });
    const exact = renderAlertEmail({
      ...ctx,
      alert: { ...ctx.alert, alertType: "exact_model" },
    });
    expect(drop.subject).toBe("Price drop on Chanel Classic Flap");
    expect(drop.preview.heading).toBe("Price just dropped");
    expect(back.subject).toBe("Back in stock: Chanel Classic Flap");
    expect(exact.subject).toBe("Exact match: Chanel Classic Flap");
  });

  it("falls back to the new_match copy for unknown alert types", () => {
    const ctx = makeContext();
    const out = renderAlertEmail({
      ...ctx,
      alert: { ...ctx.alert, alertType: "totally_made_up_type" },
    });
    expect(out.subject).toBe("New match: Chanel Classic Flap");
    expect(out.preview.heading).toBe("We found a match for your watchlist");
  });

  it("prepends appOrigin to view/save URLs in both html and text bodies", () => {
    const out = renderAlertEmail(makeContext());
    expect(out.text).toContain("https://bagscout.example.com/listings/99");
    expect(out.text).toContain("https://bagscout.example.com/listings/99?save=1");
    expect(out.html).toContain("https://bagscout.example.com/listings/99");
  });

  it("falls back to relative URLs when no appOrigin is provided", () => {
    const out = renderAlertEmail(makeContext({ appOrigin: null }));
    expect(out.text).toContain("View on BagScout: /listings/99");
    expect(out.text).not.toContain("https://bagscout.example.com");
  });

  it("escapes html-unsafe characters in user-controlled fields (XSS guard)", () => {
    const ctx = makeContext();
    const out = renderAlertEmail({
      ...ctx,
      listing: {
        ...ctx.listing,
        brand: "Evil<script>alert(1)</script>",
        model: 'Bad"Quote',
        imageUrl: "https://test.local/x.jpg?q=\"&x=1",
      },
      preference: { ...(ctx.preference as PreferenceRow), nickname: "List & Co" },
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("Evil&lt;script&gt;");
    expect(out.html).toContain("Bad&quot;Quote");
    expect(out.html).toContain("List &amp; Co");
    // Image src must have escaped query string.
    expect(out.html).toMatch(/src="https:\/\/test\.local\/x\.jpg\?q=&quot;&amp;x=1"/);
  });

  it("includes the discount delta when originalPrice > price", () => {
    const out = renderAlertEmail(makeContext());
    expect(out.text).toMatch(/\$4,800.*was \$5,500/);
    expect(out.html).toContain("was $5,500");
  });

  it("omits discount when there is no originalPrice", () => {
    const ctx = makeContext();
    const out = renderAlertEmail({
      ...ctx,
      listing: { ...ctx.listing, originalPrice: null },
    });
    expect(out.text).not.toContain("was ");
    expect(out.html).not.toContain("was ");
  });

  it("buildAlertPreview returns the same payload that renderAlertEmail embeds", () => {
    const ctx = makeContext();
    const preview = buildAlertPreview(ctx);
    const rendered = renderAlertEmail(ctx);
    expect(rendered.preview).toEqual(preview);
    expect(preview.matchScore).toBeCloseTo(0.92, 3);
    expect(preview.matchType).toBe("strong");
    expect(preview.preferenceNickname).toBe("My Chanel Watchlist");
  });
});
