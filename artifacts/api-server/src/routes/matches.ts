import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  matchResultsTable,
  bagPreferencesTable,
  listingsTable,
  sourcesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

function mapMatch(
  m: typeof matchResultsTable.$inferSelect,
  preferenceNickname: string,
  listing: typeof listingsTable.$inferSelect,
  source: typeof sourcesTable.$inferSelect,
) {
  return {
    id: m.id,
    userId: m.userId,
    preferenceId: m.preferenceId,
    preferenceNickname,
    listing: {
      ...listing,
      sourceName: source.name,
      price: parseFloat(listing.price),
      originalPrice: listing.originalPrice ? parseFloat(listing.originalPrice) : null,
      discountPercent: listing.discountPercent ? parseFloat(listing.discountPercent) : null,
    },
    matchScore: parseFloat(m.matchScore),
    matchType: m.matchType,
    matchReasons: m.matchReasons,
    disqualifiers: m.disqualifiers,
    createdAt: m.createdAt,
  };
}

// GET /api/matches
router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const limitRaw = parseInt((req.query.limit as string) ?? "30", 10);
  if (req.query.limit != null && (isNaN(limitRaw) || limitRaw < 1)) {
    res.status(400).json({ error: "Invalid limit" });
    return;
  }
  const offsetRaw = parseInt((req.query.offset as string) ?? "0", 10);
  if (req.query.offset != null && (isNaN(offsetRaw) || offsetRaw < 0)) {
    res.status(400).json({ error: "Invalid offset" });
    return;
  }
  const limit = Math.min(Number.isNaN(limitRaw) ? 30 : limitRaw, 100);
  const offset = Number.isNaN(offsetRaw) ? 0 : offsetRaw;

  const rows = await db
    .select()
    .from(matchResultsTable)
    .innerJoin(bagPreferencesTable, eq(matchResultsTable.preferenceId, bagPreferencesTable.id))
    .innerJoin(listingsTable, eq(matchResultsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(matchResultsTable.userId, userId))
    .orderBy(desc(matchResultsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(
    rows.map((r) =>
      mapMatch(r.match_results, r.bag_preferences.nickname, r.listings, r.sources),
    ),
  );
});

// GET /api/preferences/:id/matches (mounted under /preferences in routes index)
export const preferenceMatchesHandler = Router();
preferenceMatchesHandler.get("/:id/matches", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [pref] = await db
    .select()
    .from(bagPreferencesTable)
    .where(and(eq(bagPreferencesTable.id, id), eq(bagPreferencesTable.userId, userId)));
  if (!pref) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const rows = await db
    .select()
    .from(matchResultsTable)
    .innerJoin(listingsTable, eq(matchResultsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(matchResultsTable.preferenceId, id))
    .orderBy(desc(matchResultsTable.createdAt));

  res.json(rows.map((r) => mapMatch(r.match_results, pref.nickname, r.listings, r.sources)));
});

export default router;
