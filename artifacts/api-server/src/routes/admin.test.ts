import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Clerk so requireAuth + requireAdmin look at our test state.
vi.mock("@clerk/express", () => ({
  getAuth: (req: { __testUserId?: string | null }) => ({
    userId: req.__testUserId ?? null,
  }),
  clerkClient: {
    users: {
      getUser: async () => ({
        primaryEmailAddress: null,
        emailAddresses: [],
        firstName: null,
        lastName: null,
        publicMetadata: {},
      }),
    },
  },
}));

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import adminRouter from "./admin";
import {
  ensureTestUser,
  cleanupTestData,
  makeTestUserId,
} from "../test-utils/db";

let currentUserId: string | null = null;
function setUser(id: string | null) {
  currentUserId = id;
}

function buildApp(): Express {
  const app: Express = express();
  app.use(express.json());
  // Inject the mocked Clerk auth state into the request.
  app.use((req: Request & { __testUserId?: string | null }, _res: Response, next: NextFunction) => {
    req.__testUserId = currentUserId;
    next();
  });
  app.use("/api/admin", adminRouter);
  return app;
}

const app = buildApp();

let regularUserId: string;
let adminUserId: string;

beforeAll(async () => {
  // Make sure no env-based admins leak in.
  delete process.env.ADMIN_USER_IDS;
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await cleanupTestData();
  regularUserId = makeTestUserId();
  adminUserId = makeTestUserId();
  await ensureTestUser(regularUserId);
  await ensureTestUser(adminUserId);
  await db
    .update(usersTable)
    .set({ isAdmin: true })
    .where(eq(usersTable.id, adminUserId));
});

describe("admin route guards", () => {
  it("returns 401 when unauthenticated", async () => {
    setUser(null);
    const res = await request(app).get("/api/admin/sources");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-admin user", async () => {
    setUser(regularUserId);
    const res = await request(app).get("/api/admin/sources");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it("allows DB-flagged admin users (users.is_admin=true)", async () => {
    setUser(adminUserId);
    const res = await request(app).get("/api/admin/sources");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("allows users in ADMIN_USER_IDS env allowlist", async () => {
    process.env.ADMIN_USER_IDS = `${regularUserId},someone_else`;
    try {
      setUser(regularUserId);
      const res = await request(app).get("/api/admin/sources");
      expect(res.status).toBe(200);
    } finally {
      delete process.env.ADMIN_USER_IDS;
    }
  });

  it("blocks a user whose id only partially matches the allowlist", async () => {
    process.env.ADMIN_USER_IDS = `${regularUserId}_extra`;
    try {
      setUser(regularUserId);
      const res = await request(app).get("/api/admin/sources");
      expect(res.status).toBe(403);
    } finally {
      delete process.env.ADMIN_USER_IDS;
    }
  });

  it("rejects POSTs to admin write endpoints from non-admins", async () => {
    setUser(regularUserId);
    const res = await request(app)
      .post("/api/admin/ingest")
      .send({ sourceSlug: "fashionphile" });
    expect(res.status).toBe(403);
  });
});
