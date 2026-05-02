import { Router } from "express";
import { eq, and, desc, notInArray } from "drizzle-orm";
import {
  db,
  alertsTable,
  listingsTable,
  sourcesTable,
  bagPreferencesTable,
  matchResultsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { mapListing } from "../lib/mappers";
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
    listing: listing && source ? mapListing(listing, source) : null,
    matchResultId: a.matchResultId,
    alertType: a.alertType,
    status: a.status,
    message: a.message,
    whyNow: a.whyNow,
    priceAtAlert: a.priceAtAlert ? parseFloat(a.priceAtAlert) : null,
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

const ALERT_SUBJECT: Record<string, (brand: string, model: string | null) => string> = {
  new_match: (brand, model) =>
    `New match: ${brand}${model ? ` ${model}` : ""}`,
  exact_model: (brand, model) =>
    `Exact match: ${brand}${model ? ` ${model}` : ""}`,
  price_drop: (brand, model) =>
    `Price drop on ${brand}${model ? ` ${model}` : ""}`,
  back_in_stock: (brand, model) =>
    `Back in stock: ${brand}${model ? ` ${model}` : ""}`,
  better_condition: (brand, model) =>
    `Better condition appeared: ${brand}${model ? ` ${model}` : ""}`,
  under_target_price: (brand, model) =>
    `Under your target: ${brand}${model ? ` ${model}` : ""}`,
};

const ALERT_HEADING: Record<string, string> = {
  new_match: "We found a match for your watchlist",
  exact_model: "Your exact model just appeared",
  price_drop: "Price just dropped",
  back_in_stock: "Back in stock",
  better_condition: "A better-condition listing showed up",
  under_target_price: "Priced under your target",
};

router.get("/:id/preview", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select()
    .from(alertsTable)
    .innerJoin(listingsTable, eq(alertsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .leftJoin(bagPreferencesTable, eq(alertsTable.preferenceId, bagPreferencesTable.id))
    .leftJoin(
      matchResultsTable,
      eq(alertsTable.matchResultId, matchResultsTable.id),
    )
    .where(and(eq(alertsTable.id, id), eq(alertsTable.userId, userId)));

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const a = row.alerts;
  const l = row.listings;
  const s = row.sources;
  const subjectFn = ALERT_SUBJECT[a.alertType] ?? ALERT_SUBJECT.new_match;
  const heading = ALERT_HEADING[a.alertType] ?? ALERT_HEADING.new_match;

  res.json({
    id: a.id,
    alertType: a.alertType,
    subject: subjectFn(l.brand, l.model),
    heading,
    whyMatched:
      row.match_results?.matchExplanation ??
      a.message ??
      "Matches your watchlist criteria.",
    whyNow: a.whyNow,
    matchScore: row.match_results?.matchScore
      ? parseFloat(row.match_results.matchScore)
      : null,
    matchType: row.match_results?.matchType ?? null,
    preferenceNickname: row.bag_preferences?.nickname ?? null,
    listing: mapListing(l, s),
    listingUrl: l.sourceUrl,
    viewUrl: `/listings/${l.id}`,
    saveUrl: `/listings/${l.id}?save=1`,
    createdAt: a.createdAt,
  });
});

export default router;
