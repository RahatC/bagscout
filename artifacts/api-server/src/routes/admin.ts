import { Router } from "express";
import { eq, desc, count, and, gte, isNotNull, sql } from "drizzle-orm";
import {
  db,
  sourcesTable,
  listingsTable,
  ingestionLogsTable,
} from "@workspace/db";
import { z } from "zod";
import { TriggerIngestBody, RunDigestsBody, UpdateSourceBody } from "@workspace/api-zod";
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
const UpdateSourceBodyStrict = UpdateSourceBody.strict();

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

// PATCH /api/admin/sources/:slug
// Update mutable per-source operational fields (currently cadenceMinutes
// and active). Lets ops tune polling frequency without redeploying or
// touching the DB directly.
router.patch("/sources/:slug", adminWriteRateLimiter, async (req, res) => {
  const slug = String(req.params.slug);
  const parsed = UpdateSourceBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const updates: { cadenceMinutes?: number; active?: boolean } = {};
  if (parsed.data.cadenceMinutes != null)
    updates.cadenceMinutes = parsed.data.cadenceMinutes;
  if (parsed.data.active != null) updates.active = parsed.data.active;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(sourcesTable)
    .set(updates)
    .where(eq(sourcesTable.slug, slug))
    .returning();
  if (!updated) {
    res.status(404).json({ error: `Source "${slug}" not found` });
    return;
  }
  res.json({ ...updated, listingCount: updated.listingCount });
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

// GET /api/admin/source-health
// Per-source freshness rollup powering the admin dashboard widget. For each
// source we compute the last successful run, latest error, and 24h activity
// counts so operators can spot silently broken scrapers without paging
// through the raw ingestion log feed.
router.get("/source-health", async (_req, res) => {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const sources = await db.select().from(sourcesTable).orderBy(sourcesTable.name);

  // Per-source last successful run timestamp.
  const lastSuccessRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      lastSuccessAt: sql<Date>`max(${ingestionLogsTable.completedAt})`.as(
        "last_success_at",
      ),
    })
    .from(ingestionLogsTable)
    .where(
      and(
        isNotNull(ingestionLogsTable.sourceId),
        eq(ingestionLogsTable.status, "success"),
      ),
    )
    .groupBy(ingestionLogsTable.sourceId);
  const lastSuccessBySource = new Map<number, Date>(
    lastSuccessRows
      .filter((r) => r.sourceId != null && r.lastSuccessAt != null)
      .map((r) => [r.sourceId as number, new Date(r.lastSuccessAt as Date)]),
  );

  // Per-source most recent run (any status).
  const lastRunRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      startedAt: sql<Date>`max(${ingestionLogsTable.startedAt})`.as("last_run_at"),
    })
    .from(ingestionLogsTable)
    .where(isNotNull(ingestionLogsTable.sourceId))
    .groupBy(ingestionLogsTable.sourceId);
  const lastRunStartBySource = new Map<number, Date>(
    lastRunRows
      .filter((r) => r.sourceId != null && r.startedAt != null)
      .map((r) => [r.sourceId as number, new Date(r.startedAt as Date)]),
  );

  // Resolve the actual last-run row to expose its status.
  const lastRunStatusBySource = new Map<
    number,
    { status: string; startedAt: Date }
  >();
  for (const [sourceId, startedAt] of lastRunStartBySource) {
    const [row] = await db
      .select({
        status: ingestionLogsTable.status,
        startedAt: ingestionLogsTable.startedAt,
      })
      .from(ingestionLogsTable)
      .where(
        and(
          eq(ingestionLogsTable.sourceId, sourceId),
          eq(ingestionLogsTable.startedAt, startedAt),
        ),
      )
      .limit(1);
    if (row) lastRunStatusBySource.set(sourceId, row);
  }

  // Per-source latest error (failed/partial with a non-null message).
  const lastErrorRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      errorMessage: ingestionLogsTable.errorMessage,
      startedAt: ingestionLogsTable.startedAt,
    })
    .from(ingestionLogsTable)
    .where(
      and(
        isNotNull(ingestionLogsTable.sourceId),
        isNotNull(ingestionLogsTable.errorMessage),
      ),
    )
    .orderBy(desc(ingestionLogsTable.startedAt));
  const lastErrorBySource = new Map<
    number,
    { errorMessage: string; startedAt: Date }
  >();
  for (const r of lastErrorRows) {
    if (r.sourceId == null || r.errorMessage == null) continue;
    if (!lastErrorBySource.has(r.sourceId)) {
      lastErrorBySource.set(r.sourceId, {
        errorMessage: r.errorMessage,
        startedAt: r.startedAt,
      });
    }
  }

  // 24h aggregates: total runs, failed runs, listings created.
  const aggRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      runs: count(ingestionLogsTable.id),
      failures: sql<number>`count(*) filter (where ${ingestionLogsTable.status} = 'failed')`.as(
        "failures",
      ),
      listingsAdded: sql<number>`coalesce(sum(${ingestionLogsTable.recordsCreated}), 0)`.as(
        "listings_added",
      ),
    })
    .from(ingestionLogsTable)
    .where(
      and(
        isNotNull(ingestionLogsTable.sourceId),
        gte(ingestionLogsTable.startedAt, since24h),
      ),
    )
    .groupBy(ingestionLogsTable.sourceId);
  const aggBySource = new Map<
    number,
    { runs: number; failures: number; listingsAdded: number }
  >(
    aggRows
      .filter((r) => r.sourceId != null)
      .map((r) => [
        r.sourceId as number,
        {
          runs: Number(r.runs ?? 0),
          failures: Number(r.failures ?? 0),
          listingsAdded: Number(r.listingsAdded ?? 0),
        },
      ]),
  );

  const entries = sources.map((s) => {
    const lastSuccessAt = lastSuccessBySource.get(s.id) ?? null;
    const lastRun = lastRunStatusBySource.get(s.id) ?? null;
    const lastErr = lastErrorBySource.get(s.id) ?? null;
    const agg = aggBySource.get(s.id) ?? {
      runs: 0,
      failures: 0,
      listingsAdded: 0,
    };

    // Cadence-aware staleness threshold: if a source is supposed to run every
    // N minutes, anything older than 3*N (and at least 1h) without a fresh
    // success counts as stale/degraded.
    const staleAfterMs = Math.max(
      60 * 60 * 1000,
      s.cadenceMinutes * 60 * 1000 * 3,
    );
    const successWithin24h =
      lastSuccessAt != null && lastSuccessAt >= since24h;
    const successFresh =
      lastSuccessAt != null &&
      now.getTime() - lastSuccessAt.getTime() <= staleAfterMs;

    let status: "healthy" | "degraded" | "failed" | "idle";
    if (lastRun == null) {
      status = s.active ? "failed" : "idle";
    } else if (lastRun.status === "failed" && !successFresh) {
      status = "failed";
    } else if (!successWithin24h && s.active) {
      status = "failed";
    } else if (
      lastRun.status === "partial" ||
      lastRun.status === "failed" ||
      !successFresh
    ) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      sourceId: s.id,
      slug: s.slug,
      name: s.name,
      active: s.active,
      status,
      lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
      lastRunAt: lastRun ? lastRun.startedAt.toISOString() : null,
      lastRunStatus: lastRun ? lastRun.status : null,
      lastErrorAt: lastErr ? lastErr.startedAt.toISOString() : null,
      lastErrorMessage: lastErr ? lastErr.errorMessage : null,
      listingsAdded24h: agg.listingsAdded,
      runs24h: agg.runs,
      failures24h: agg.failures,
    };
  });

  // Banner trigger: no active source has succeeded in the last 24h. If there
  // are no active sources at all, treat as success (nothing to alarm about).
  const activeSources = entries.filter((e) => e.active);
  const anySuccessIn24h =
    activeSources.length === 0 ||
    activeSources.some(
      (e) => e.lastSuccessAt != null && new Date(e.lastSuccessAt) >= since24h,
    );

  res.json({
    generatedAt: now.toISOString(),
    anySuccessIn24h,
    sources: entries,
  });
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
