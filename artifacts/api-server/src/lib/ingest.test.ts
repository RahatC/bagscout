import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_SOURCE_SLUG = "test_ingest_source";

// Module-level holder the mock factory reads from. Kept on globalThis so the
// hoisted vi.mock factory (which can't close over module-local variables)
// can still see it.
declare global {
  // eslint-disable-next-line no-var
  var __TEST_INGEST_FIXTURE__: { listings: Array<Record<string, unknown>> };
}
globalThis.__TEST_INGEST_FIXTURE__ ??= { listings: [] };
const fixtureState = globalThis.__TEST_INGEST_FIXTURE__;

vi.mock("../adapters", async () => {
  const base = await import("../adapters/base");
  const slug = "test_ingest_source";
  const adapter = {
    sourceName: "TEST_INGEST",
    sourceSlug: slug,
    baseUrl: "https://test.local",
    fetchListings: async () =>
      (globalThis as { __TEST_INGEST_FIXTURE__?: { listings: unknown[] } })
        .__TEST_INGEST_FIXTURE__!.listings as never,
    normalizeListing: (raw: never) =>
      base.defaultNormalize(raw, {
        source: "TEST_INGEST",
        baseUrl: "https://test.local",
      }),
    validateListing: base.defaultValidate,
  };
  return {
    adapters: [adapter],
    getAdapter: (s: string) => (s === slug ? adapter : undefined),
  };
});

import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  listingsTable,
  listingSnapshotsTable,
  matchResultsTable,
  alertsTable,
  ingestionLogsTable,
  bagPreferencesTable,
  bagPreferenceBrandsTable,
  bagPreferenceColorsTable,
  bagPreferenceSizesTable,
} from "@workspace/db";
import { runMockIngest } from "./ingest";
import {
  cleanupTestData,
  ensureTestSource,
  ensureTestUser,
  makeTestUserId,
  refLookups,
} from "../test-utils/db";

let userId: string;
let prefId: number;
let ref: Awaited<ReturnType<typeof refLookups>>;

beforeAll(async () => {
  ref = await refLookups();
  await ensureTestSource(TEST_SOURCE_SLUG, "Test Ingest Source");
});

afterAll(async () => {
  await cleanupTestData({ testSourceSlug: TEST_SOURCE_SLUG });
});

beforeEach(async () => {
  await cleanupTestData({ testSourceSlug: TEST_SOURCE_SLUG });
  await ensureTestSource(TEST_SOURCE_SLUG, "Test Ingest Source");
  userId = makeTestUserId();
  await ensureTestUser(userId);

  // Insert a Chanel preference broad enough to match the fixture.
  const [pref] = await db
    .insert(bagPreferencesTable)
    .values({
      userId,
      nickname: "Chanel anything black medium",
      exactModelEnabled: false,
      conditionMinId: ref.condition("very good").id,
      allowCloseColorMatch: true,
      maxPrice: "6000",
      onlyExactCriteria: false,
      allowCloseMatches: true,
      active: true,
      alertFrequency: "realtime",
    })
    .returning();
  prefId = pref.id;
  await db.insert(bagPreferenceBrandsTable).values({
    preferenceId: prefId,
    brandId: ref.brand("chanel").id,
  });
  await db.insert(bagPreferenceColorsTable).values({
    preferenceId: prefId,
    colorId: ref.color("black").id,
  });
  await db.insert(bagPreferenceSizesTable).values({
    preferenceId: prefId,
    sizeId: ref.size("medium").id,
  });
});

function fixtureListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    externalId: "ing-001",
    title: "Chanel Classic Flap Medium Black Caviar",
    brand: "Chanel",
    model: "Classic Flap",
    style: "Shoulder Bag",
    color: "Black",
    size: "Medium",
    condition: "Excellent",
    price: 4800,
    imageUrl: "https://test.local/img/1.jpg",
    description: "Test fixture",
    ...overrides,
  };
}

describe("ingest pipeline — initial run", () => {
  it("inserts the listing, writes a snapshot, opens+closes an ingestion log, and emits a new_match alert", async () => {
    fixtureState.listings = [fixtureListing()];
    const result = await runMockIngest(TEST_SOURCE_SLUG);

    expect(result.errors).toEqual([]);
    expect(result.listingsFound).toBe(1);
    expect(result.listingsAdded).toBe(1);
    expect(result.listingsUpdated).toBe(0);
    expect(result.listingsRejected).toBe(0);

    const sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Ingest Source");
    const listings = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.sourceId, sourceId));
    expect(listings).toHaveLength(1);
    const listing = listings[0];
    expect(listing.sourceListingId).toBe("ing-001");
    expect(parseFloat(listing.price)).toBe(4800);

    const snaps = await db
      .select()
      .from(listingSnapshotsTable)
      .where(eq(listingSnapshotsTable.listingId, listing.id));
    expect(snaps).toHaveLength(1);
    expect(parseFloat(snaps[0].price)).toBe(4800);

    const matches = await db
      .select()
      .from(matchResultsTable)
      .where(eq(matchResultsTable.preferenceId, prefId));
    expect(matches).toHaveLength(1);
    expect(matches[0].alertEligible).toBe(true);
    expect(matches[0].matchType).toMatch(/exact|strong|close/);

    const alerts = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.preferenceId, prefId))
      .orderBy(asc(alertsTable.id));
    const types = alerts.map((a) => a.alertType);
    expect(types).toContain("new_match");
    // 4800 ≤ 6000 * 0.85 = 5100 → under_target_price should fire
    expect(types).toContain("under_target_price");

    const logs = await db
      .select()
      .from(ingestionLogsTable)
      .where(eq(ingestionLogsTable.sourceId, listing.sourceId));
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("success");
    expect(logs[0].recordsSeen).toBe(1);
    expect(logs[0].recordsCreated).toBe(1);
    expect(logs[0].completedAt).not.toBeNull();
  });

  it("rejects listings that fail validation without raising an alert", async () => {
    fixtureState.listings = [
      fixtureListing({ externalId: "bad-1", price: 0 }), // invalid: price <= 0
    ];
    const result = await runMockIngest(TEST_SOURCE_SLUG);
    expect(result.listingsRejected).toBe(1);
    expect(result.listingsAdded).toBe(0);

    const sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Ingest Source");
    const listings = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.sourceId, sourceId));
    expect(listings).toHaveLength(0);
    const matches = await db
      .select()
      .from(matchResultsTable)
      .where(eq(matchResultsTable.userId, userId));
    expect(matches).toHaveLength(0);
  });
});

describe("ingest pipeline — delta detection (price drop, back in stock, unavailability)", () => {
  it("emits a price_drop alert when price falls ≥5% on a follow-up run", async () => {
    fixtureState.listings = [fixtureListing({ price: 5000 })];
    await runMockIngest(TEST_SOURCE_SLUG);

    // Simulate that 24h+ have passed for the existing new_match cooldown by
    // backdating those alerts. price_drop is a fresh type so cooldown
    // isn't an issue, but we want a clean re-evaluation.
    fixtureState.listings = [fixtureListing({ price: 4500 })]; // -10%
    await runMockIngest(TEST_SOURCE_SLUG);

    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.sourceListingId, "ing-001"));
    expect(parseFloat(listing.price)).toBe(4500);

    const snaps = await db
      .select()
      .from(listingSnapshotsTable)
      .where(eq(listingSnapshotsTable.listingId, listing.id))
      .orderBy(asc(listingSnapshotsTable.capturedAt));
    expect(snaps).toHaveLength(2);
    expect(parseFloat(snaps[0].price)).toBe(5000);
    expect(parseFloat(snaps[1].price)).toBe(4500);

    const alerts = await db
      .select()
      .from(alertsTable)
      .where(
        and(eq(alertsTable.preferenceId, prefId), eq(alertsTable.alertType, "price_drop")),
      );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].priceAtAlert).not.toBeNull();
    expect(parseFloat(alerts[0].priceAtAlert!)).toBe(4500);
  });

  it("does NOT emit price_drop when the change is below the 5% threshold", async () => {
    fixtureState.listings = [fixtureListing({ price: 5000 })];
    await runMockIngest(TEST_SOURCE_SLUG);

    fixtureState.listings = [fixtureListing({ price: 4900 })]; // -2%
    await runMockIngest(TEST_SOURCE_SLUG);

    const alerts = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.alertType, "price_drop"));
    expect(alerts).toHaveLength(0);
  });

  it("dismisses pending alerts and stops emitting when a listing goes unavailable", async () => {
    fixtureState.listings = [fixtureListing({ price: 5000 })];
    await runMockIngest(TEST_SOURCE_SLUG);

    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.sourceListingId, "ing-001"));

    // Sanity: at least one pending alert exists for this listing.
    const beforePending = await db
      .select()
      .from(alertsTable)
      .where(
        and(eq(alertsTable.listingId, listing.id), eq(alertsTable.status, "pending")),
      );
    expect(beforePending.length).toBeGreaterThan(0);

    await db
      .update(listingsTable)
      .set({ availabilityStatus: "sold" })
      .where(eq(listingsTable.id, listing.id));

    const { matchListingAgainstAllPreferences } = await import("./ingest");
    await matchListingAgainstAllPreferences(listing.id);

    const after = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.listingId, listing.id));
    expect(after.length).toBeGreaterThan(0);
    for (const a of after) {
      expect(a.status).toBe("dismissed");
    }
  });

  it("emits a back_in_stock alert when availability transitions from sold → available", async () => {
    // First run inserts the listing as available.
    fixtureState.listings = [fixtureListing({ price: 5000 })];
    await runMockIngest(TEST_SOURCE_SLUG);

    // Mark sold, then reissue the matcher so prior alerts get dismissed and
    // we have a clean baseline.
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.sourceListingId, "ing-001"));
    await db
      .update(listingsTable)
      .set({ availabilityStatus: "sold" })
      .where(eq(listingsTable.id, listing.id));

    // Clear ONLY this listing's alerts so we can isolate the
    // back_in_stock signal without touching unrelated rows.
    await db.delete(alertsTable).where(eq(alertsTable.listingId, listing.id));

    // Now run the ingest again — the adapter says available, so the
    // transition prevAvailability=sold → newAvailability=available fires.
    fixtureState.listings = [fixtureListing({ price: 5000 })];
    await runMockIngest(TEST_SOURCE_SLUG);

    const back = await db
      .select()
      .from(alertsTable)
      .where(
        and(
          eq(alertsTable.listingId, listing.id),
          eq(alertsTable.alertType, "back_in_stock"),
        ),
      );
    expect(back).toHaveLength(1);
  });

  it("a follow-up ingest with no changes increments updated count, writes a snapshot, but emits no duplicate alerts (cooldown)", async () => {
    fixtureState.listings = [fixtureListing({ price: 5000 })];
    await runMockIngest(TEST_SOURCE_SLUG);
    const alertsAfterFirst = await db.select().from(alertsTable);

    // Same listing again — same price, same availability.
    fixtureState.listings = [fixtureListing({ price: 5000 })];
    const result = await runMockIngest(TEST_SOURCE_SLUG);
    expect(result.listingsUpdated).toBe(1);
    expect(result.listingsAdded).toBe(0);

    const alertsAfterSecond = await db.select().from(alertsTable);
    expect(alertsAfterSecond.length).toBe(alertsAfterFirst.length);

    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.sourceListingId, "ing-001"));
    const snaps = await db
      .select()
      .from(listingSnapshotsTable)
      .where(eq(listingSnapshotsTable.listingId, listing.id));
    expect(snaps).toHaveLength(2);
  });
});
