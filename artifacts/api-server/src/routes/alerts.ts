import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, alertsTable, listingsTable, sourcesTable, watchlistsTable } from "@workspace/db";
import { ListAlertsQueryParams, MarkAlertReadParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

function mapAlert(
  a: typeof alertsTable.$inferSelect,
  listing: (typeof listingsTable.$inferSelect) | null,
  source: (typeof sourcesTable.$inferSelect) | null,
  watchlistName: string | null,
) {
  return {
    id: a.id,
    userId: a.userId,
    matchId: a.matchId,
    watchlistId: a.watchlistId,
    watchlistName,
    listing: listing && source
      ? {
          ...listing,
          sourceName: source.name,
          price: parseFloat(listing.price),
          originalPrice: listing.originalPrice ? parseFloat(listing.originalPrice) : null,
        }
      : null,
    type: a.type,
    message: a.message,
    isRead: a.isRead,
    createdAt: a.createdAt,
  };
}

// GET /api/alerts
router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = ListAlertsQueryParams.safeParse({
    unreadOnly: req.query.unreadOnly === "true" ? true : req.query.unreadOnly === "false" ? false : undefined,
  });

  const conditions = [eq(alertsTable.userId, userId)];
  if (parsed.data?.unreadOnly) conditions.push(eq(alertsTable.isRead, false));

  const rows = await db
    .select()
    .from(alertsTable)
    .leftJoin(listingsTable, eq(alertsTable.listingId, listingsTable.id))
    .leftJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .leftJoin(watchlistsTable, eq(alertsTable.watchlistId, watchlistsTable.id))
    .where(and(...conditions))
    .orderBy(desc(alertsTable.createdAt))
    .limit(100);

  res.json(rows.map((r) =>
    mapAlert(r.alerts, r.listings, r.sources, r.watchlists?.name ?? null),
  ));
});

// POST /api/alerts/:id/read
router.post("/:id/read", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = MarkAlertReadParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [alert] = await db
    .update(alertsTable)
    .set({ isRead: true })
    .where(and(eq(alertsTable.id, parsed.data.id), eq(alertsTable.userId, userId)))
    .returning();
  if (!alert) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(mapAlert(alert, null, null, null));
});

// POST /api/alerts/read-all
router.post("/read-all", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  await db
    .update(alertsTable)
    .set({ isRead: true })
    .where(and(eq(alertsTable.userId, userId), eq(alertsTable.isRead, false)));
  res.status(204).end();
});

export default router;
