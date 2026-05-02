import { Router } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import {
  db,
  sourcesTable,
  listingsTable,
  ingestionLogsTable,
  alertsTable,
  bagPreferencesTable,
} from "@workspace/db";
import { TriggerIngestBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { runMockIngest, runAllIngests } from "../lib/ingest";
import { count } from "drizzle-orm";

const router = Router();

// All admin endpoints require both auth + admin role.
router.use(requireAuth, requireAdmin);

router.get("/sources", async (_req, res) => {
  const rows = await db
    .select({
      source: sourcesTable,
      listingCount: count(listingsTable.id),
    })
    .from(sourcesTable)
    .leftJoin(listingsTable, eq(listingsTable.sourceId, sourcesTable.id))
    .groupBy(sourcesTable.id)
    .orderBy(sourcesTable.name);

  res.json(
    rows.map((r) => ({
      ...r.source,
      listingCount: r.listingCount,
    })),
  );
});

router.get("/ingestion-logs", async (req, res) => {
  const raw = parseInt((req.query.limit as string) ?? "50", 10);
  if (req.query.limit != null && (isNaN(raw) || raw < 1)) {
    res.status(400).json({ error: "Invalid limit" });
    return;
  }
  const limit = Math.min(Number.isNaN(raw) ? 50 : raw, 200);

  const rows = await db
    .select({
      log: ingestionLogsTable,
      sourceName: sourcesTable.name,
    })
    .from(ingestionLogsTable)
    .innerJoin(sourcesTable, eq(ingestionLogsTable.sourceId, sourcesTable.id))
    .orderBy(desc(ingestionLogsTable.startedAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      ...r.log,
      sourceName: r.sourceName,
    })),
  );
});

router.post("/ingest", async (req, res) => {
  const parsed = TriggerIngestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  // Special slug "all" runs every registered adapter sequentially.
  if (parsed.data.sourceSlug === "all") {
    const results = await runAllIngests();
    const totals = results.reduce(
      (acc, r) => {
        acc.listingsFound += r.listingsFound;
        acc.listingsAdded += r.listingsAdded;
        acc.listingsUpdated += r.listingsUpdated;
        acc.durationMs += r.durationMs;
        acc.errors.push(...r.errors);
        return acc;
      },
      {
        sourceSlug: "all",
        listingsFound: 0,
        listingsAdded: 0,
        listingsUpdated: 0,
        durationMs: 0,
        errors: [] as string[],
      },
    );
    res.json({ ...totals, perSource: results });
    return;
  }
  const result = await runMockIngest(parsed.data.sourceSlug);
  res.json(result);
});

// POST /api/admin/digests/run
// Group all "pending" alerts by user + watchlist alertFrequency, mark them
// "sent" with timestamps, and return per-frequency counts. This stands in for
// a real email worker so the rest of the system can be exercised without
// hooking up SMTP.
router.post("/digests/run", async (_req, res) => {
  const pending = await db
    .select({
      alertId: alertsTable.id,
      userId: alertsTable.userId,
      frequency: bagPreferencesTable.alertFrequency,
    })
    .from(alertsTable)
    .innerJoin(
      bagPreferencesTable,
      eq(alertsTable.preferenceId, bagPreferencesTable.id),
    )
    .where(eq(alertsTable.status, "pending"));

  const byFrequency: Record<"realtime" | "daily" | "weekly", number> = {
    realtime: 0,
    daily: 0,
    weekly: 0,
  };
  const userIds = new Set<string>();
  const ids: number[] = [];
  for (const row of pending) {
    const f =
      row.frequency === "realtime" || row.frequency === "daily" || row.frequency === "weekly"
        ? row.frequency
        : "realtime";
    byFrequency[f] += 1;
    userIds.add(row.userId);
    ids.push(row.alertId);
  }

  if (ids.length > 0) {
    await db
      .update(alertsTable)
      .set({
        status: "sent",
        sentAt: sql`now()`,
        digestSentAt: sql`now()`,
      })
      .where(and(eq(alertsTable.status, "pending"), inArray(alertsTable.id, ids)));
  }

  res.json({
    usersNotified: userIds.size,
    alertsSent: ids.length,
    byFrequency,
  });
});

export default router;
