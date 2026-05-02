import { Router } from "express";
import { eq, and, count, sql, desc, lte } from "drizzle-orm";
import {
  db,
  watchlistsTable,
  matchesTable,
  alertsTable,
  savedListingsTable,
  listingsTable,
  sourcesTable,
} from "@workspace/db";
import { GetRecentMatchesQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

// GET /api/dashboard/summary
router.get("/summary", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;

  const [wlRow] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${watchlistsTable.isActive} = true)::int`,
    })
    .from(watchlistsTable)
    .where(eq(watchlistsTable.userId, userId));

  const userWatchlists = await db
    .select({ id: watchlistsTable.id })
    .from(watchlistsTable)
    .where(eq(watchlistsTable.userId, userId));

  const wlIds = userWatchlists.map((w) => w.id);

  let totalMatchCount = 0;
  let newMatchCount = 0;
  if (wlIds.length > 0) {
    const [mRow] = await db
      .select({
        total: count(),
        newCount: sql<number>`count(*) filter (where ${matchesTable.isNew} = true)::int`,
      })
      .from(matchesTable)
      .where(sql`${matchesTable.watchlistId} = ANY(${sql.raw(`ARRAY[${wlIds.join(",")}]::int[]`)})`);
    totalMatchCount = mRow.total;
    newMatchCount = mRow.newCount;
  }

  const [alertRow] = await db
    .select({ unread: count() })
    .from(alertsTable)
    .where(and(eq(alertsTable.userId, userId), eq(alertsTable.isRead, false)));

  const [savedRow] = await db
    .select({ total: count() })
    .from(savedListingsTable)
    .where(eq(savedListingsTable.userId, userId));

  const topBrandsRows = await db
    .select({ brand: watchlistsTable.brand, count: count() })
    .from(watchlistsTable)
    .where(eq(watchlistsTable.userId, userId))
    .groupBy(watchlistsTable.brand)
    .orderBy(desc(count()))
    .limit(5);

  res.json({
    watchlistCount: wlRow.total,
    activeWatchlistCount: wlRow.active,
    totalMatchCount,
    newMatchCount,
    unreadAlertCount: alertRow.unread,
    savedCount: savedRow.total,
    topBrands: topBrandsRows.map((r) => ({ brand: r.brand, count: r.count })),
  });
});

// GET /api/dashboard/recent-matches
router.get("/recent-matches", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = GetRecentMatchesQueryParams.safeParse({
    limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
  });
  const limit = parsed.data?.limit ?? 10;

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
    .innerJoin(watchlistsTable, eq(matchesTable.watchlistId, watchlistsTable.id))
    .innerJoin(listingsTable, eq(matchesTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(watchlistsTable.userId, userId))
    .orderBy(desc(matchesTable.createdAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      id: r.matches.id,
      watchlistId: r.matches.watchlistId,
      watchlistName: r.watchlists.name,
      listing: {
        ...r.listings,
        sourceName: r.sources.name,
        price: parseFloat(r.listings.price),
        originalPrice: r.listings.originalPrice ? parseFloat(r.listings.originalPrice) : null,
      },
      score: parseFloat(r.matches.score),
      matchReasons: r.matches.matchReasons,
      isNew: r.matches.isNew,
      createdAt: r.matches.createdAt,
    })),
  );
});

// GET /api/dashboard/price-drops
router.get("/price-drops", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  // Return listings with an original price higher than the current price
  const rows = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(
      and(
        eq(listingsTable.isAvailable, true),
        sql`${listingsTable.originalPrice} IS NOT NULL AND ${listingsTable.originalPrice} > ${listingsTable.price}`,
      ),
    )
    .orderBy(desc(listingsTable.seenAt))
    .limit(12);

  res.json(
    rows.map((r) => ({
      ...r.listings,
      sourceName: r.sources.name,
      price: parseFloat(r.listings.price),
      originalPrice: r.listings.originalPrice ? parseFloat(r.listings.originalPrice) : null,
    })),
  );
});

export default router;
