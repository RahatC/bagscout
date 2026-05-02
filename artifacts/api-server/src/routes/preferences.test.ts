import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stub auth before importing the router.
vi.mock("../middlewares/requireAuth", async () => {
  const { fakeRequireAuth } = await import("../test-utils/auth");
  return { requireAuth: fakeRequireAuth, requireAdmin: fakeRequireAuth };
});

import request from "supertest";
import { eq, sql } from "drizzle-orm";
import {
  db,
  bagPreferencesTable,
  bagPreferenceBrandsTable,
  bagPreferenceColorsTable,
  bagPreferenceSizesTable,
  bagPreferenceStylesTable,
  listingsTable,
  matchResultsTable,
} from "@workspace/db";
import { buildPreferencesApp } from "../test-utils/app";
import { setTestUser } from "../test-utils/auth";
import {
  ensureTestUser,
  ensureTestSource,
  cleanupTestData,
  refLookups,
  makeTestUserId,
} from "../test-utils/db";

const app = buildPreferencesApp();
const TEST_SOURCE_SLUG = "test_pref_source";

let userId: string;
let ref: Awaited<ReturnType<typeof refLookups>>;

beforeAll(async () => {
  ref = await refLookups();
  await ensureTestSource(TEST_SOURCE_SLUG, "Test Pref Source");
});

afterAll(async () => {
  await cleanupTestData({ testSourceSlug: TEST_SOURCE_SLUG });
});

beforeEach(async () => {
  await cleanupTestData();
  userId = makeTestUserId();
  await ensureTestUser(userId);
  setTestUser(userId);
});

describe("preferences CRUD", () => {
  it("rejects unauthenticated requests", async () => {
    setTestUser(null);
    const res = await request(app).get("/api/preferences");
    expect(res.status).toBe(401);
  });

  it("creates a preference and returns the expanded row", async () => {
    const body = {
      nickname: "My Chanel",
      exactModelEnabled: true,
      modelQuery: "classic flap",
      conditionMinId: ref.condition("very good").id,
      allowCloseColorMatch: true,
      minPrice: 4000,
      maxPrice: 6000,
      onlyExactCriteria: false,
      allowCloseMatches: true,
      active: true,
      alertFrequency: "realtime",
      brandIds: [ref.brand("chanel").id],
      styleIds: [ref.style("shoulder bag").id],
      colorIds: [ref.color("black").id],
      sizeIds: [ref.size("medium").id],
    };
    const res = await request(app).post("/api/preferences").send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      nickname: "My Chanel",
      exactModelEnabled: true,
      modelQuery: "classic flap",
      minPrice: 4000,
      maxPrice: 6000,
      allowCloseColorMatch: true,
      onlyExactCriteria: false,
      allowCloseMatches: true,
      active: true,
      alertFrequency: "realtime",
      matchCount: 0,
    });
    expect(res.body.brands).toHaveLength(1);
    expect(res.body.brands[0].normalizedName).toBe("chanel");
    expect(res.body.styles[0].normalizedName).toBe("shoulder bag");
    expect(res.body.colors[0].normalizedName).toBe("black");
    expect(res.body.sizes[0].normalizedName).toBe("medium");
    expect(res.body.conditionMin?.normalizedName).toBe("very good");
  });

  it("returns 400 when body is invalid (missing nickname)", async () => {
    const res = await request(app)
      .post("/api/preferences")
      .send({ brandIds: [ref.brand("chanel").id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid body");
  });

  it("lists only the caller's preferences", async () => {
    // create one for the active user
    await request(app)
      .post("/api/preferences")
      .send({ nickname: "Mine", brandIds: [ref.brand("chanel").id] })
      .expect(201);

    // create one for a different user
    const otherUser = makeTestUserId();
    await ensureTestUser(otherUser);
    setTestUser(otherUser);
    await request(app)
      .post("/api/preferences")
      .send({ nickname: "Theirs", brandIds: [ref.brand("hermes").id] })
      .expect(201);

    setTestUser(userId);
    const res = await request(app).get("/api/preferences");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nickname).toBe("Mine");
  });

  it("get-by-id 404s for a preference owned by another user", async () => {
    const otherUser = makeTestUserId();
    await ensureTestUser(otherUser);
    setTestUser(otherUser);
    const created = await request(app)
      .post("/api/preferences")
      .send({ nickname: "Other", brandIds: [ref.brand("chanel").id] })
      .expect(201);

    setTestUser(userId);
    const res = await request(app).get(`/api/preferences/${created.body.id}`);
    expect(res.status).toBe(404);
  });

  it("get-by-id 400s on non-numeric id", async () => {
    const res = await request(app).get("/api/preferences/notanumber");
    expect(res.status).toBe(400);
  });

  it("PATCH updates scalar fields and replaces junctions atomically", async () => {
    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "v1",
        brandIds: [ref.brand("chanel").id],
        colorIds: [ref.color("black").id],
        maxPrice: 5000,
      })
      .expect(201);

    const id = created.body.id;
    const res = await request(app)
      .patch(`/api/preferences/${id}`)
      .send({
        nickname: "v2",
        maxPrice: 7500,
        brandIds: [ref.brand("hermes").id, ref.brand("chanel").id],
        colorIds: [], // explicit empty clears
      });
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe("v2");
    expect(res.body.maxPrice).toBe(7500);
    expect(res.body.brands.map((b: { normalizedName: string }) => b.normalizedName).sort()).toEqual(
      ["chanel", "hermes"],
    );
    expect(res.body.colors).toEqual([]);
  });

  it("PATCH 404s for a foreign preference", async () => {
    const otherUser = makeTestUserId();
    await ensureTestUser(otherUser);
    setTestUser(otherUser);
    const created = await request(app)
      .post("/api/preferences")
      .send({ nickname: "Other", brandIds: [ref.brand("chanel").id] })
      .expect(201);

    setTestUser(userId);
    const res = await request(app)
      .patch(`/api/preferences/${created.body.id}`)
      .send({ nickname: "hacked" });
    expect(res.status).toBe(404);
  });

  it("PATCH validates body", async () => {
    const created = await request(app)
      .post("/api/preferences")
      .send({ nickname: "v1", brandIds: [ref.brand("chanel").id] })
      .expect(201);

    const res = await request(app)
      .patch(`/api/preferences/${created.body.id}`)
      .send({ alertFrequency: "yearly" }); // not in enum
    expect(res.status).toBe(400);
  });

  it("DELETE removes the preference and its junctions", async () => {
    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "to-delete",
        brandIds: [ref.brand("chanel").id],
        colorIds: [ref.color("black").id],
      })
      .expect(201);

    const res = await request(app).delete(`/api/preferences/${created.body.id}`);
    expect(res.status).toBe(204);

    const remaining = await db
      .select()
      .from(bagPreferencesTable)
      .where(eq(bagPreferencesTable.id, created.body.id));
    expect(remaining).toHaveLength(0);

    const junctions = await db
      .select()
      .from(bagPreferenceBrandsTable)
      .where(eq(bagPreferenceBrandsTable.preferenceId, created.body.id));
    expect(junctions).toHaveLength(0);
  });

  it("DELETE is a no-op (204) for a foreign id (does not delete it)", async () => {
    const otherUser = makeTestUserId();
    await ensureTestUser(otherUser);
    setTestUser(otherUser);
    const created = await request(app)
      .post("/api/preferences")
      .send({ nickname: "other", brandIds: [ref.brand("chanel").id] })
      .expect(201);

    setTestUser(userId);
    const res = await request(app).delete(`/api/preferences/${created.body.id}`);
    expect(res.status).toBe(204);

    const stillThere = await db
      .select()
      .from(bagPreferencesTable)
      .where(eq(bagPreferencesTable.id, created.body.id));
    expect(stillThere).toHaveLength(1);
  });

  it("matchCount reflects rows in match_results for the preference", async () => {
    const sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Pref Source");
    const created = await request(app)
      .post("/api/preferences")
      .send({ nickname: "withMatches", brandIds: [ref.brand("chanel").id] })
      .expect(201);

    // Insert a listing then a fake match_result row.
    const [listing] = await db
      .insert(listingsTable)
      .values({
        sourceId,
        sourceListingId: "match-count-1",
        sourceUrl: "https://test.local/x",
        title: "Chanel Classic Flap",
        brand: "Chanel",
        normalizedBrand: "chanel",
        price: "5000.00",
        currency: "USD",
        availabilityStatus: "available",
      })
      .returning();
    await db.insert(matchResultsTable).values({
      userId,
      preferenceId: created.body.id,
      listingId: listing.id,
      matchScore: "0.900",
      matchType: "strong",
      matchExplanation: "test",
      alertEligible: true,
      matchReasons: [],
      disqualifiers: [],
    });

    const res = await request(app).get(`/api/preferences/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.matchCount).toBe(1);
  });
});

describe("suggestions engine", () => {
  it("suggests enabling close color match when colors are set and toggle is off", async () => {
    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "p",
        brandIds: [ref.brand("chanel").id],
        colorIds: [ref.color("black").id],
        allowCloseColorMatch: false,
      })
      .expect(201);

    const res = await request(app).get(`/api/preferences/${created.body.id}/suggestions`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions.map((s: { type: string }) => s.type)).toContain("add_close_colors");
  });

  it("does NOT suggest add_close_colors when no colors are selected", async () => {
    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "p",
        brandIds: [ref.brand("chanel").id],
        allowCloseColorMatch: false,
      })
      .expect(201);

    const res = await request(app).get(`/api/preferences/${created.body.id}/suggestions`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions.map((s: { type: string }) => s.type)).not.toContain(
      "add_close_colors",
    );
  });

  it("suggests adjacent sizes when only one size is selected and other sizes appear in available listings for the brand", async () => {
    const sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Pref Source");
    // Seed listings with various sizes for chanel
    await db.insert(listingsTable).values([
      {
        sourceId,
        sourceListingId: "size-a-1",
        sourceUrl: "https://test.local/1",
        title: "Chanel small",
        brand: "Chanel",
        normalizedBrand: "chanel",
        size: "Small",
        price: "1000",
        currency: "USD",
        availabilityStatus: "available",
      },
      {
        sourceId,
        sourceListingId: "size-a-2",
        sourceUrl: "https://test.local/2",
        title: "Chanel small 2",
        brand: "Chanel",
        normalizedBrand: "chanel",
        size: "Small",
        price: "1100",
        currency: "USD",
        availabilityStatus: "available",
      },
      {
        sourceId,
        sourceListingId: "size-b-1",
        sourceUrl: "https://test.local/3",
        title: "Chanel large",
        brand: "Chanel",
        normalizedBrand: "chanel",
        size: "Large",
        price: "2000",
        currency: "USD",
        availabilityStatus: "available",
      },
    ]);

    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "p",
        brandIds: [ref.brand("chanel").id],
        sizeIds: [ref.size("medium").id], // user only watches Medium
      })
      .expect(201);

    const res = await request(app).get(`/api/preferences/${created.body.id}/suggestions`);
    expect(res.status).toBe(200);
    const adj = res.body.suggestions.find(
      (s: { type: string }) => s.type === "add_adjacent_sizes",
    );
    expect(adj).toBeTruthy();
    expect(adj.suggestedSizeIds.length).toBeGreaterThan(0);
    expect(adj.suggestedSizeIds.length).toBeLessThanOrEqual(2);
  });

  it("suggests raising max price when median exceeds the cap by >10% with at least 5 samples", async () => {
    const sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Pref Source");
    // Ten Chanel listings with prices 8000–9800 → median ~8900
    const rows = Array.from({ length: 10 }, (_, i) => ({
      sourceId,
      sourceListingId: `raise-${i}`,
      sourceUrl: `https://test.local/r${i}`,
      title: `Chanel ${i}`,
      brand: "Chanel",
      normalizedBrand: "chanel",
      price: String(8000 + i * 200),
      currency: "USD",
      availabilityStatus: "available",
    }));
    await db.insert(listingsTable).values(rows);

    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "p",
        brandIds: [ref.brand("chanel").id],
        maxPrice: 5000,
      })
      .expect(201);

    const res = await request(app).get(`/api/preferences/${created.body.id}/suggestions`);
    expect(res.status).toBe(200);
    const raise = res.body.suggestions.find(
      (s: { type: string }) => s.type === "raise_max_price",
    );
    expect(raise).toBeTruthy();
    expect(raise.suggestedMaxPrice).toBeGreaterThan(5000);
  });

  it("suggests opening up to similar models when exactModelEnabled + modelQuery", async () => {
    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "p",
        brandIds: [ref.brand("chanel").id],
        exactModelEnabled: true,
        modelQuery: "classic flap",
      })
      .expect(201);

    const res = await request(app).get(`/api/preferences/${created.body.id}/suggestions`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions.map((s: { type: string }) => s.type)).toContain(
      "include_adjacent_models",
    );
  });

  it("returns no suggestions for a wide-open preference", async () => {
    const created = await request(app)
      .post("/api/preferences")
      .send({
        nickname: "wide",
        brandIds: [ref.brand("chanel").id],
        // no sizes, no maxPrice, allowCloseColorMatch defaults to true,
        // exactModelEnabled defaults to false
      })
      .expect(201);

    const res = await request(app).get(`/api/preferences/${created.body.id}/suggestions`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it("suggestions endpoint 404s for foreign preference id", async () => {
    const otherUser = makeTestUserId();
    await ensureTestUser(otherUser);
    setTestUser(otherUser);
    const created = await request(app)
      .post("/api/preferences")
      .send({ nickname: "o", brandIds: [ref.brand("chanel").id] })
      .expect(201);

    setTestUser(userId);
    const res = await request(app).get(`/api/preferences/${created.body.id}/suggestions`);
    expect(res.status).toBe(404);
  });
});
