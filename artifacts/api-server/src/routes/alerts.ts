import { Router } from "express";
import { eq, and, desc, notInArray } from "drizzle-orm";
import {
  db,
  alertsTable,
  listingsTable,
  sourcesTable,
  bagPreferencesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

function mapAlert(
  a: typeof alertsTable.$inferSelect,
  listing: typeof listingsTable.$inferSelect | null,
  source: typeof sourcesTable.$inferSelect | null,
  preferenceNickname: string | null,
) {
  return {
    id: a.id,
    userId: a.userId,
    preferenceId: a.preferenceId,
    preferenceNickname,
    listing:
      listing && source
        ? {
            ...listing,
            sourceName: source.name,
            price: parseFloat(listing.price),
            originalPrice: listing.originalPrice ? parseFloat(listing.originalPrice) : null,
            discountPercent: listing.discountPercent ? parseFloat(listing.discountPercent) : null,
          }
        : null,
    matchResultId: a.matchResultId,
    alertType: a.alertType,
    status: a.status,
    message: a.message,
    sentAt: a.sentAt,
    createdAt: a.createdAt,
  };
}

router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const unreadOnly = req.query.unreadOnly === "true";

  const conds = [eq(alertsTable.userId, userId)];
  if (unreadOnly) {
    // "unread" means status is neither 'read' nor 'dismissed'
    // (i.e. 'pending' or 'sent' alerts that the user hasn't acted on yet).
    conds.push(notInArray(alertsTable.status, ["read", "dismissed"]));
  }

  const rows = await db
    .select()
    .from(alertsTable)
    .leftJoin(listingsTable, eq(alertsTable.listingId, listingsTable.id))
    .leftJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .leftJoin(bagPreferencesTable, eq(alertsTable.preferenceId, bagPreferencesTable.id))
    .where(and(...conds))
    .orderBy(desc(alertsTable.createdAt))
    .limit(100);

  res.json(
    rows.map((r) =>
      mapAlert(r.alerts, r.listings, r.sources, r.bag_preferences?.nickname ?? null),
    ),
  );
});

router.post("/:id/read", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [alert] = await db
    .update(alertsTable)
    .set({ status: "read" })
    .where(and(eq(alertsTable.id, id), eq(alertsTable.userId, userId)))
    .returning();
  if (!alert) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(mapAlert(alert, null, null, null));
});

router.post("/read-all", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  await db
    .update(alertsTable)
    .set({ status: "read" })
    .where(
      and(
        eq(alertsTable.userId, userId),
        notInArray(alertsTable.status, ["read", "dismissed"]),
      ),
    );
  res.status(204).end();
});

export default router;
