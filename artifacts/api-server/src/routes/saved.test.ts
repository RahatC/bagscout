import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middlewares/requireAuth", async () => {
  const { fakeRequireAuth } = await import("../test-utils/auth");
  return { requireAuth: fakeRequireAuth, requireAdmin: fakeRequireAuth };
});

import express, { type Express } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, listingsTable, savedListingsTable } from "@workspace/db";
import savedRouter from "./saved";
import { setTestUser } from "../test-utils/auth";
import {
  ensureTestUser,
  ensureTestSource,
  cleanupTestData,
  makeTestUserId,
} from "../test-utils/db";

function buildApp(): Express {
  const app: Express = express();
  app.use(express.json());
  app.use("/api/saved", savedRouter);
  return app;
}

const app = buildApp();
const TEST_SOURCE_SLUG = "test_saved_source";

let userId: string;
let otherUserId: string;
let sourceId: number;
let listingId: number;
let listing2Id: number;

async function insertTestListing(extId: string, price: number): Promise<number> {
  const [row] = await db
    .insert(listingsTable)
    .values({
      sourceId,
      sourceListingId: extId,
      sourceUrl: `https://test.local/${extId}`,
      title: `Test ${extId}`,
      brand: "Chanel",
      normalizedBrand: "chanel",
      price: String(price),
      currency: "USD",
      imageUrl: "https://placehold.co/400",
      availabilityStatus: "available",
    })
    .returning({ id: listingsTable.id });
  return row.id;
}

beforeAll(async () => {
  sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Saved Source");
});

afterAll(async () => {
  await cleanupTestData({ testSourceSlug: TEST_SOURCE_SLUG });
});

beforeEach(async () => {
  await cleanupTestData();
  userId = makeTestUserId();
  otherUserId = makeTestUserId();
  await ensureTestUser(userId);
  await ensureTestUser(otherUserId);
  setTestUser(userId);
  // Refresh test listings each run since cleanupTestData wipes test source
  // listings via the source-slug branch only; the per-source delete leaves
  // listings if not slug-targeted, so re-insert deterministically here.
  await db
    .delete(listingsTable)
    .where(eq(listingsTable.sourceId, sourceId));
  listingId = await insertTestListing("saved-listing-1", 5500);
  listing2Id = await insertTestListing("saved-listing-2", 7800);
});

describe("saved listings routes", () => {
  it("GET requires auth", async () => {
    setTestUser(null);
    const res = await request(app).get("/api/saved");
    expect(res.status).toBe(401);
  });

  it("POST adds a saved listing and GET returns it", async () => {
    const post = await request(app)
      .post("/api/saved")
      .send({ listingId, note: "love this one" });
    expect(post.status).toBe(201);
    expect(post.body.listing.id).toBe(listingId);
    expect(post.body.note).toBe("love this one");

    const list = await request(app).get("/api/saved");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].listing.id).toBe(listingId);
    expect(list.body[0].listing.price).toBe(5500); // numeric, not string
    expect(list.body[0].listing.sourceName).toBe("Test Saved Source");
  });

  it("POST a second time for the same listing is idempotent (409 conflict)", async () => {
    const first = await request(app).post("/api/saved").send({ listingId });
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/saved").send({ listingId });
    expect(second.status).toBe(409);
  });

  it("POST with invalid body returns 400", async () => {
    const res = await request(app).post("/api/saved").send({ note: "x" });
    expect(res.status).toBe(400);
  });

  it("DELETE removes a saved listing for the current user only", async () => {
    await request(app).post("/api/saved").send({ listingId });

    // Other user saves the same listing
    setTestUser(otherUserId);
    await request(app).post("/api/saved").send({ listingId });

    // Original user deletes — should not affect other user's saved row
    setTestUser(userId);
    const del = await request(app).delete(`/api/saved/${listingId}`);
    expect(del.status).toBe(204);

    const userList = await request(app).get("/api/saved");
    expect(userList.body).toHaveLength(0);

    setTestUser(otherUserId);
    const otherList = await request(app).get("/api/saved");
    expect(otherList.body).toHaveLength(1);
  });

  it("DELETE with invalid id returns 400", async () => {
    const res = await request(app).delete("/api/saved/not-a-number");
    expect(res.status).toBe(400);
  });

  it("GET only returns the current user's saves (data isolation)", async () => {
    await request(app).post("/api/saved").send({ listingId });

    setTestUser(otherUserId);
    await request(app).post("/api/saved").send({ listingId: listing2Id });

    setTestUser(userId);
    const list = await request(app).get("/api/saved");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].listing.id).toBe(listingId);
  });

  it("GET orders saves by createdAt DESC (most recent first)", async () => {
    await request(app).post("/api/saved").send({ listingId });
    // Small delay to ensure distinct createdAt timestamps.
    await new Promise((r) => setTimeout(r, 10));
    await request(app).post("/api/saved").send({ listingId: listing2Id });

    const list = await request(app).get("/api/saved");
    expect(list.body).toHaveLength(2);
    expect(list.body[0].listing.id).toBe(listing2Id);
    expect(list.body[1].listing.id).toBe(listingId);
  });
});
