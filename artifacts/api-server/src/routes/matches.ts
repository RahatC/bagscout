import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  matchesTable,
  watchlistsTable,
  listingsTable,
  sourcesTable,
} from "@workspace/db";
import {
  ListMatchesQueryParams,
  GetWatchlistMatchesParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

function mapMatch(
  m: typeof matchesTable.$inferSelect,
  watchlistName: string,
  listing: typeof listingsTable.$inferSelect,
  source: typeof sourcesTable.$inferSelect,
) {
  return {
    id: m.id,
    watchlistId: m.watchlistId,
    watchlistName,
    listing: {
      ...listing,
      sourceName: source.name,
      price: parseFloat(listing.price),
      originalPrice: listing.originalPrice
        ? parseFloat(listing.originalPrice)
        : null,
    },
    score: parseFloat(m.score),
    matchReasons: m.matchReasons,
    isNew: m.isNew,
    createdAt: m.createdAt,
  };
}

// GET /api/matches
router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = ListMatchesQueryParams.safeParse({
    limit: req.query.limit ? parseInt(req.query.limit as string) : 30,
    offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const userWatchlists = await db
    .select({ id: watchlistsTable.id })
    .from(watchlistsTable)
    .where(eq(watchlistsTable.userId, userId));

  if (!userWatchlists.length) {
    res.json([]);
    return;
  }

  const rows = await db
    .select()
    .from(matchesTable)
    .innerJoin(
      watchlistsTable,
      eq(matchesTable.watchlistId, watchlistsTable.id),
    )
    .innerJoin(listingsTable, eq(matchesTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(watchlistsTable.userId, userId))
    .orderBy(desc(matchesTable.createdAt))
    .limit(parsed.data.limit ?? 30)
    .offset(parsed.data.offset ?? 0);

  res.json(
    rows.map((r) =>
      mapMatch(r.matches, r.watchlists.name, r.listings, r.sources),
    ),
  );
});

export default router;
