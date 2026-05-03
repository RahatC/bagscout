import { Router } from "express";
import { eq, desc, count } from "drizzle-orm";
import {
  db,
  sourcesTable,
  listingsTable,
  ingestionLogsTable,
} from "@workspace/db";
import { z } from "zod";
import { TriggerIngestBody, RunDigestsBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { adminWriteRateLimiter } from "../middlewares/security";
import { runMockIngest, runAllIngests } from "../lib/ingest";
import { withDigestLock, withIngestLock } from "../lib/scheduler";
import { runDigest } from "../lib/digest";
import type { Request } from "express";

const router = Router();

// All admin endpoints require both auth + admin role.
router.use(requireAuth, requireAdmin);

type AuthRequest = Request & { userId: string };

// Reject unknown fields on POST bodies so typos don't silently no-op.
const TriggerIngestBodyStrict = TriggerIngestBody.strict();
const RunDigestsBodyStrict = RunDigestsBody.strict();

const IngestionLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

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
  const parsed = IngestionLogsQuery.safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }
  const { limit } = parsed.data;

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

router.post("/ingest", adminWriteRateLimiter, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = TriggerIngestBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  // Acquire the same advisory lock the scheduler uses so manual admin
  // triggers can never overlap with a scheduled tick (or with each other).
  // Returns 409 Conflict if a run is already in flight.
  const lockResult = await withIngestLock(async () => {
    // Audit row recording who triggered the run. Per-source rows from
    // runMockIngest still get written separately; this aggregate row is
    // what carries the actorUserId stamp for the admin trigger.
    const [auditLog] = await db
      .insert(ingestionLogsTable)
      .values({
        sourceId: null,
        jobType: "manual_admin",
        status: "running",
        actorUserId: userId,
      })
      .returning({ id: ingestionLogsTable.id });

    try {
      let value;
      let totalErrors = 0;
      let recordsSeen = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;
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
        value = { ...totals, perSource: results };
        totalErrors = totals.errors.length;
        recordsSeen = totals.listingsFound;
        recordsCreated = totals.listingsAdded;
        recordsUpdated = totals.listingsUpdated;
      } else {
        const result = await runMockIngest(parsed.data.sourceSlug);
        value = result;
        totalErrors = result.errors.length;
        recordsSeen = result.listingsFound;
        recordsCreated = result.listingsAdded;
        recordsUpdated = result.listingsUpdated;
      }

      const status: "success" | "partial" | "failed" =
        totalErrors === 0
          ? "success"
          : recordsCreated + recordsUpdated === 0
            ? "failed"
            : "partial";
      await db
        .update(ingestionLogsTable)
        .set({
          status,
          recordsSeen,
          recordsCreated,
          recordsUpdated,
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));

      return value;
    } catch (err) {
      await db
        .update(ingestionLogsTable)
        .set({
          status: "failed",
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(
            0,
            500,
          ),
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));
      throw err;
    }
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
router.post("/digests/run", adminWriteRateLimiter, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = RunDigestsBodyStrict.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const dryRun = parsed.data.dryRun === true;
  // Acquire the same advisory lock the scheduler uses so manual digest
  // triggers can never overlap with a scheduled tick (or with each other).
  // Dry runs also take the lock so they can't race a real send.
  const lockResult = await withDigestLock(async () => {
    const [auditLog] = await db
      .insert(ingestionLogsTable)
      .values({
        sourceId: null,
        jobType: dryRun ? "manual_digest_dryrun" : "manual_digest",
        status: "running",
        actorUserId: userId,
      })
      .returning({ id: ingestionLogsTable.id });
    try {
      const result = await runDigest({ dryRun });
      const status: "success" | "partial" | "failed" = result.aborted
        ? "failed"
        : result.alertsFailed === 0
          ? "success"
          : result.alertsSent === 0
            ? "failed"
            : "partial";
      await db
        .update(ingestionLogsTable)
        .set({
          status,
          recordsSeen: result.alertsSent + result.alertsFailed + result.alertsSkipped,
          recordsCreated: result.alertsSent,
          recordsUpdated: result.alertsSkipped,
          errorMessage: result.aborted?.reason ?? null,
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));
      return result;
    } catch (err) {
      await db
        .update(ingestionLogsTable)
        .set({
          status: "failed",
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(
            0,
            500,
          ),
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));
      throw err;
    }
  });
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
