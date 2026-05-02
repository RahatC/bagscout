import { Router } from "express";
import { eq, and, count, sql, desc, notInArray } from "drizzle-orm";
import {
  db,
  bagPreferencesTable,
  bagPreferenceBrandsTable,
  brandsTable,
  matchResultsTable,
  alertsTable,
  savedListingsTable,
  listingsTable,
  sourcesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

router.get("/summary", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;

  const [prefRow] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${bagPreferencesTable.active} = true)::int`,
    })
    .from(bagPreferencesTable)
    .where(eq(bagPreferencesTable.userId, userId));

  const [matchRow] = await db
    .select({
      total: count(),
      newCount: sql<number>`count(*) filter (where ${matchResultsTable.createdAt} > now() - interval '7 days')::int`,
    })
    .from(matchResultsTable)
    .where(eq(matchResultsTable.userId, userId));

  const [alertRow] = await db
    .select({ unread: count() })
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.userId, userId),
        notInArray(alertsTable.status, ["read", "dismissed"]),
      ),
    );

  const [savedRow] = await db
    .select({ total: count() })
    .from(savedListingsTable)
    .where(eq(savedListingsTable.userId, userId));

  // Top brands across the user's preferences
  const topBrandsRows = await db
    .select({ brand: brandsTable.name, count: count() })
    .from(bagPreferenceBrandsTable)
    .innerJoin(bagPreferencesTable, eq(bagPreferenceBrandsTable.preferenceId, bagPreferencesTable.id))
    .innerJoin(brandsTable, eq(bagPreferenceBrandsTable.brandId, brandsTable.id))
    .where(eq(bagPreferencesTable.userId, userId))
    .groupBy(brandsTable.name)
    .orderBy(desc(count()))
    .limit(5);

  res.json({
    preferenceCount: prefRow.total,
    activePreferenceCount: prefRow.active,
    totalMatchCount: matchRow.total,
    newMatchCount: matchRow.newCount,
    unreadAlertCount: alertRow.unread,
    savedCount: savedRow.total,
    topBrands: topBrandsRows.map((r) => ({ brand: r.brand, count: r.count })),
  });
});

router.get("/recent-matches", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const raw = parseInt((req.query.limit as string) ?? "10", 10);
  if (req.query.limit != null && (isNaN(raw) || raw < 1)) {
    res.status(400).json({ error: "Invalid limit" });
    return;
  }
  const limit = Math.min(Number.isNaN(raw) ? 10 : raw, 50);

  const rows = await db
    .select()
    .from(matchResultsTable)
    .innerJoin(bagPreferencesTable, eq(matchResultsTable.preferenceId, bagPreferencesTable.id))
    .innerJoin(listingsTable, eq(matchResultsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(matchResultsTable.userId, userId))
    .orderBy(desc(matchResultsTable.matchScore), desc(matchResultsTable.createdAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      id: r.match_results.id,
      userId: r.match_results.userId,
      preferenceId: r.match_results.preferenceId,
      preferenceNickname: r.bag_preferences.nickname,
      listing: {
        ...r.listings,
        sourceName: r.sources.name,
        price: parseFloat(r.listings.price),
        originalPrice: r.listings.originalPrice ? parseFloat(r.listings.originalPrice) : null,
        discountPercent: r.listings.discountPercent ? parseFloat(r.listings.discountPercent) : null,
      },
      matchScore: parseFloat(r.match_results.matchScore),
      matchType: r.match_results.matchType,
      matchExplanation: r.match_results.matchExplanation,
      alertEligible: r.match_results.alertEligible,
      matchReasons: r.match_results.matchReasons,
      disqualifiers: r.match_results.disqualifiers,
      createdAt: r.match_results.createdAt,
    })),
  );
});

router.get("/price-drops", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(
      and(
        eq(listingsTable.availabilityStatus, "available"),
        sql`${listingsTable.originalPrice} IS NOT NULL AND ${listingsTable.originalPrice} > ${listingsTable.price}`,
      ),
    )
    .orderBy(desc(listingsTable.lastSeenAt))
    .limit(12);

  res.json(
    rows.map((r) => ({
      ...r.listings,
      sourceName: r.sources.name,
      price: parseFloat(r.listings.price),
      originalPrice: r.listings.originalPrice ? parseFloat(r.listings.originalPrice) : null,
      discountPercent: r.listings.discountPercent ? parseFloat(r.listings.discountPercent) : null,
    })),
  );
});

export default router;
