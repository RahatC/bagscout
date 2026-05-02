import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, savedListingsTable, listingsTable, sourcesTable } from "@workspace/db";
import { SaveListingBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

function mapSaved(
  s: typeof savedListingsTable.$inferSelect,
  l: typeof listingsTable.$inferSelect,
  src: typeof sourcesTable.$inferSelect,
) {
  return {
    id: s.id,
    userId: s.userId,
    listing: {
      ...l,
      sourceName: src.name,
      price: parseFloat(l.price),
      originalPrice: l.originalPrice ? parseFloat(l.originalPrice) : null,
      discountPercent: l.discountPercent ? parseFloat(l.discountPercent) : null,
    },
    note: s.note,
    createdAt: s.createdAt,
  };
}

router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const rows = await db
    .select()
    .from(savedListingsTable)
    .innerJoin(listingsTable, eq(savedListingsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(savedListingsTable.userId, userId))
    .orderBy(desc(savedListingsTable.createdAt));

  res.json(rows.map((r) => mapSaved(r.saved_listings, r.listings, r.sources)));
});

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
      note: parsed.data.note ?? null,
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

  res.status(201).json(mapSaved(row.saved_listings, row.listings, row.sources));
});

router.delete("/:listingId", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const listingId = parseInt(String(req.params.listingId));
  if (isNaN(listingId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(savedListingsTable)
    .where(
      and(eq(savedListingsTable.userId, userId), eq(savedListingsTable.listingId, listingId)),
    );
  res.status(204).end();
});

export default router;
