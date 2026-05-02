import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  watchlistsTable,
  matchesTable,
  listingsTable,
  sourcesTable,
} from "@workspace/db";
import {
  CreateWatchlistBody,
  UpdateWatchlistBody,
  GetWatchlistParams,
  DeleteWatchlistParams,
  GetWatchlistMatchesParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

// GET /api/watchlists
router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const watchlists = await db
    .select()
    .from(watchlistsTable)
    .where(eq(watchlistsTable.userId, userId))
    .orderBy(watchlistsTable.createdAt);

  res.json(
    watchlists.map((w) => ({
      ...w,
      minPrice: w.minPrice ? parseFloat(w.minPrice) : null,
      maxPrice: w.maxPrice ? parseFloat(w.maxPrice) : null,
    })),
  );
});

// POST /api/watchlists
router.post("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = CreateWatchlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const data = parsed.data;
  const [wl] = await db
    .insert(watchlistsTable)
    .values({
      userId,
      name: data.name,
      brand: data.brand,
      model: data.model ?? null,
      style: data.style ?? null,
      color: data.color ?? null,
      size: data.size ?? null,
      condition: data.condition ?? null,
      minPrice: data.minPrice != null ? String(data.minPrice) : null,
      maxPrice: data.maxPrice != null ? String(data.maxPrice) : null,
      matchType: data.matchType ?? "close",
      isActive: true,
    })
    .returning();

  res.status(201).json({
    ...wl,
    minPrice: wl.minPrice ? parseFloat(wl.minPrice) : null,
    maxPrice: wl.maxPrice ? parseFloat(wl.maxPrice) : null,
  });
});

// GET /api/watchlists/:id
router.get("/:id", requireAuth, async (req, res) => {
  if (req.params.id === "matches") return; // handled separately
  const { userId } = req as AuthRequest;
  const parsed = GetWatchlistParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success || isNaN(parseInt(req.params.id))) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [wl] = await db
    .select()
    .from(watchlistsTable)
    .where(
      and(
        eq(watchlistsTable.id, parsed.data.id),
        eq(watchlistsTable.userId, userId),
      ),
    );
  if (!wl) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    ...wl,
    minPrice: wl.minPrice ? parseFloat(wl.minPrice) : null,
    maxPrice: wl.maxPrice ? parseFloat(wl.maxPrice) : null,
  });
});

// GET /api/watchlists/:id/matches
router.get("/:id/matches", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = GetWatchlistMatchesParams.safeParse({
    id: parseInt(req.params.id),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [wl] = await db
    .select()
    .from(watchlistsTable)
    .where(
      and(
        eq(watchlistsTable.id, parsed.data.id),
        eq(watchlistsTable.userId, userId),
      ),
    );
  if (!wl) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const rows = await db
    .select()
    .from(matchesTable)
    .innerJoin(listingsTable, eq(matchesTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(matchesTable.watchlistId, wl.id))
    .orderBy(desc(matchesTable.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.matches.id,
      watchlistId: r.matches.watchlistId,
      watchlistName: wl.name,
      listing: {
        ...r.listings,
        sourceName: r.sources.name,
        price: parseFloat(r.listings.price),
        originalPrice: r.listings.originalPrice
          ? parseFloat(r.listings.originalPrice)
          : null,
      },
      score: parseFloat(r.matches.score),
      matchReasons: r.matches.matchReasons,
      isNew: r.matches.isNew,
      createdAt: r.matches.createdAt,
    })),
  );
});

// PATCH /api/watchlists/:id
router.patch("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateWatchlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.brand !== undefined) updates.brand = data.brand;
  if (data.model !== undefined) updates.model = data.model;
  if (data.style !== undefined) updates.style = data.style;
  if (data.color !== undefined) updates.color = data.color;
  if (data.size !== undefined) updates.size = data.size;
  if (data.condition !== undefined) updates.condition = data.condition;
  if (data.minPrice !== undefined)
    updates.minPrice =
      data.minPrice != null ? String(data.minPrice) : null;
  if (data.maxPrice !== undefined)
    updates.maxPrice =
      data.maxPrice != null ? String(data.maxPrice) : null;
  if (data.matchType !== undefined) updates.matchType = data.matchType;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const [wl] = await db
    .update(watchlistsTable)
    .set(updates)
    .where(
      and(eq(watchlistsTable.id, id), eq(watchlistsTable.userId, userId)),
    )
    .returning();
  if (!wl) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    ...wl,
    minPrice: wl.minPrice ? parseFloat(wl.minPrice) : null,
    maxPrice: wl.maxPrice ? parseFloat(wl.maxPrice) : null,
  });
});

// DELETE /api/watchlists/:id
router.delete("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = DeleteWatchlistParams.safeParse({
    id: parseInt(req.params.id),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(watchlistsTable)
    .where(
      and(
        eq(watchlistsTable.id, parsed.data.id),
        eq(watchlistsTable.userId, userId),
      ),
    );
  res.status(204).end();
});

export default router;
