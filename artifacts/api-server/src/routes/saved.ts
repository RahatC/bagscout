import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, savedListingsTable, listingsTable, sourcesTable } from "@workspace/db";
import { SaveListingBody, UnsaveListingParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

// GET /api/saved
router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const rows = await db
    .select()
    .from(savedListingsTable)
    .innerJoin(listingsTable, eq(savedListingsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(savedListingsTable.userId, userId))
    .orderBy(desc(savedListingsTable.savedAt));

  res.json(
    rows.map((r) => ({
      id: r.saved_listings.id,
      userId: r.saved_listings.userId,
      listing: {
        ...r.listings,
        sourceName: r.sources.name,
        price: parseFloat(r.listings.price),
        originalPrice: r.listings.originalPrice ? parseFloat(r.listings.originalPrice) : null,
      },
      notes: r.saved_listings.notes,
      savedAt: r.saved_listings.savedAt,
    })),
  );
});

// POST /api/saved
router.post("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = SaveListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const [saved] = await db
    .insert(savedListingsTable)
    .values({
      userId,
      listingId: parsed.data.listingId,
      notes: parsed.data.notes ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!saved) {
    res.status(409).json({ error: "Already saved" });
    return;
  }

  const [row] = await db
    .select()
    .from(savedListingsTable)
    .innerJoin(listingsTable, eq(savedListingsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(savedListingsTable.id, saved.id));

  res.status(201).json({
    id: row.saved_listings.id,
    userId: row.saved_listings.userId,
    listing: {
      ...row.listings,
      sourceName: row.sources.name,
      price: parseFloat(row.listings.price),
      originalPrice: row.listings.originalPrice ? parseFloat(row.listings.originalPrice) : null,
    },
    notes: row.saved_listings.notes,
    savedAt: row.saved_listings.savedAt,
  });
});

// DELETE /api/saved/:listingId
router.delete("/:listingId", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = UnsaveListingParams.safeParse({ listingId: parseInt(req.params.listingId) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(savedListingsTable)
    .where(
      and(
        eq(savedListingsTable.userId, userId),
        eq(savedListingsTable.listingId, parsed.data.listingId),
      ),
    );
  res.status(204).end();
});

export default router;
