import { Router } from "express";
import { eq, desc, count } from "drizzle-orm";
import {
  db,
  sourcesTable,
  listingsTable,
  ingestionLogsTable,
} from "@workspace/db";
import { TriggerIngestBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { runMockIngest, runAllIngests } from "../lib/ingest";
import { withDigestLock, withIngestLock } from "../lib/scheduler";
import { runDigest } from "../lib/digest";

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
    // LEFT JOIN: aggregate (scheduled_run) and digest (scheduled_digest) rows
    // have a NULL source_id; an INNER JOIN would silently hide them from the
    // admin feed.
    .leftJoin(sourcesTable, eq(ingestionLogsTable.sourceId, sourcesTable.id))
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
  // Acquire the same advisory lock the scheduler uses so manual admin
  // triggers can never overlap with a scheduled tick (or with each other).
  // Returns 409 Conflict if a run is already in flight.
  const lockResult = await withIngestLock(async () => {
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
      return { ...totals, perSource: results };
    }
    return runMockIngest(parsed.data.sourceSlug);
  });
  if (!lockResult.acquired) {
    res.status(409).json({ error: "An ingest run is already in progress" });
    return;
  }
  res.json(lockResult.value);
});

// POST /api/admin/digests/run
// Send pending alerts via Resend, grouped per (user, alert). Respects the
// per-user notification_preferences row for channel="email" and the alert's
// alert_type. An alert is only flipped from "pending" -> "sent" after the
// Resend call returns a message id; failures are recorded so a later run can
// retry. Pass `dryRun: true` to render + log emails without calling Resend.
router.post("/digests/run", async (req, res) => {
  const dryRun = req.body?.dryRun === true;
  // Acquire the same advisory lock the scheduler uses so manual digest
  // triggers can never overlap with a scheduled tick (or with each other).
  // Dry runs also take the lock so they can't race a real send.
  const lockResult = await withDigestLock(() => runDigest({ dryRun }));
  if (!lockResult.acquired) {
    res.status(409).json({ error: "A digest run is already in progress" });
    return;
  }
  const result = lockResult.value;
  if (result.aborted) {
    res.status(503).json({ error: result.aborted.reason });
    return;
  }
  res.json(result);
});

export default router;
