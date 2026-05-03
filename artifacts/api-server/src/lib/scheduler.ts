import { sql, eq } from "drizzle-orm";
import { db, pool, ingestionLogsTable, sourcesTable } from "@workspace/db";
import { runMockIngest, type IngestResult } from "./ingest";
import { adapters } from "../adapters";
import { runDigest, type DigestRunResult } from "./digest";
import { logger } from "./logger";

/**
 * Postgres advisory-lock keys. Stable arbitrary 32-bit ints — pick anything
 * project-unique. We use these so a long-running ingest doesn't double-fire
 * if the interval ticks while the previous run is still in flight, and so a
 * second process (e.g. an admin trigger or a Replit Scheduled Deployment
 * invocation) can't stomp on an in-progress scheduled run either.
 */
const LOCK_KEY_INGEST = 8472001;
const LOCK_KEY_DIGEST = 8472002;

/**
 * Try to acquire a Postgres session-level advisory lock. Returns the held
 * client (which MUST be released by calling `releaseAdvisoryLock`) or null
 * if the lock is already held by another session.
 *
 * We pin to a single client because pg advisory locks are session-scoped;
 * the matching unlock has to run on the same connection that acquired it.
 */
// pg's Pool.connect has overloaded signatures; the TS-inferred return type can
// collapse to `void`. Define a minimal structural type for the bits we use so
// we don't have to add `@types/pg` as a direct devDependency of this package.
type AdvisoryLockClient = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
  release: () => void;
};

export async function withIngestLock<T>(
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  return withAdvisoryLock(LOCK_KEY_INGEST, fn);
}

export async function withDigestLock<T>(
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  return withAdvisoryLock(LOCK_KEY_DIGEST, fn);
}

async function withAdvisoryLock<T>(
  key: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const client = await tryAcquireAdvisoryLock(key);
  if (!client) return { acquired: false };
  try {
    const value = await fn();
    return { acquired: true, value };
  } finally {
    await releaseAdvisoryLock(client, key);
  }
}

async function tryAcquireAdvisoryLock(
  key: number,
): Promise<AdvisoryLockClient | null> {
  const client = (await pool.connect()) as unknown as AdvisoryLockClient;
  try {
    const res = await client.query("SELECT pg_try_advisory_lock($1)", [key]);
    if (res.rows[0]?.pg_try_advisory_lock === true) {
      return client;
    }
    client.release();
    return null;
  } catch (err) {
    client.release();
    throw err;
  }
}

async function releaseAdvisoryLock(
  client: AdvisoryLockClient,
  key: number,
): Promise<void> {
  try {
    await client.query("SELECT pg_advisory_unlock($1)", [key]);
  } catch (err) {
    logger.warn({ err, key }, "Failed to release advisory lock");
  } finally {
    client.release();
  }
}

export type ScheduledIngestSummary = {
  ran: boolean;
  reason?: "locked" | "disabled";
  durationMs: number;
  sourcesRun: number;
  sourcesSkipped: number;
  totals: {
    listingsFound: number;
    listingsAdded: number;
    listingsUpdated: number;
    listingsRejected: number;
    errors: number;
  };
  perSource: Array<{
    sourceSlug: string;
    ran: boolean;
    skipReason?: "not_due" | "no_adapter" | "inactive";
    result?: IngestResult;
    error?: string;
  }>;
};

export type ScheduledDigestSummary = {
  ran: boolean;
  reason?: "locked" | "disabled";
  durationMs: number;
  digest?: DigestRunResult;
};

/**
 * Run one scheduler tick: examine every active registered source and run
 * its ingest if its per-source cadence has elapsed since `lastIngestAt`.
 *
 * Wrapped in the global ingest advisory lock so concurrent ticks (or a
 * Scheduled Deployment invocation) can't double-fire. Each source is run
 * inside its own try/catch so one failing adapter never blocks the rest.
 *
 * `force=true` ignores cadence and runs every active source whose adapter
 * is registered (used by the manual "trigger all" admin path).
 */
export async function runScheduledIngest(
  opts: { force?: boolean } = {},
): Promise<ScheduledIngestSummary> {
  const start = Date.now();
  const result = await withIngestLock(() => doScheduledIngest(start, opts));
  if (!result.acquired) {
    logger.info(
      { lockKey: LOCK_KEY_INGEST },
      "Skipping scheduled ingest — previous run still in progress",
    );
    return {
      ran: false,
      reason: "locked",
      durationMs: 0,
      sourcesRun: 0,
      sourcesSkipped: 0,
      totals: {
        listingsFound: 0,
        listingsAdded: 0,
        listingsUpdated: 0,
        listingsRejected: 0,
        errors: 0,
      },
      perSource: [],
    };
  }
  return result.value;
}

async function doScheduledIngest(
  start: number,
  opts: { force?: boolean },
): Promise<ScheduledIngestSummary> {
  const force = opts.force ?? false;

  // Open an aggregate `scheduled_run` row up-front so the admin ingestion-log
  // feed always has a one-line summary per scheduler tick (per-source rows
  // are still written separately by runMockIngest). source_id is null
  // because this represents the whole cycle.
  const [aggregateLog] = await db
    .insert(ingestionLogsTable)
    .values({
      sourceId: null,
      jobType: "scheduled_run",
      status: "running",
    })
    .returning({ id: ingestionLogsTable.id });

  // Resolve which sources are due. We use the DB row (not just the static
  // adapter registry) because cadence_minutes and last_ingest_at live there
  // — that's how operators tune polling without redeploying code.
  const sourceRows = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.active, true));

  const now = Date.now();
  const perSource: ScheduledIngestSummary["perSource"] = [];
  const totals = {
    listingsFound: 0,
    listingsAdded: 0,
    listingsUpdated: 0,
    listingsRejected: 0,
    errors: 0,
  };
  let sourcesRun = 0;
  let sourcesSkipped = 0;

  for (const src of sourceRows) {
    const adapter = adapters.find((a) => a.sourceSlug === src.slug);
    if (!adapter) {
      perSource.push({
        sourceSlug: src.slug,
        ran: false,
        skipReason: "no_adapter",
      });
      sourcesSkipped++;
      continue;
    }

    const cadenceMs = Math.max(1, src.cadenceMinutes) * 60_000;
    const dueAt = src.lastIngestAt
      ? src.lastIngestAt.getTime() + cadenceMs
      : 0;
    if (!force && now < dueAt) {
      perSource.push({
        sourceSlug: src.slug,
        ran: false,
        skipReason: "not_due",
      });
      sourcesSkipped++;
      continue;
    }

    try {
      const result = await runMockIngest(src.slug, { jobType: "scheduled" });
      totals.listingsFound += result.listingsFound;
      totals.listingsAdded += result.listingsAdded;
      totals.listingsUpdated += result.listingsUpdated;
      totals.listingsRejected += result.listingsRejected;
      totals.errors += result.errors.length;
      perSource.push({ sourceSlug: src.slug, ran: true, result });
      sourcesRun++;
    } catch (err) {
      // Per-source isolation: log and move on so one bad adapter doesn't
      // poison the rest of the tick. runMockIngest already records its own
      // failures into ingestion_logs; this is a final safety net.
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, sourceSlug: src.slug },
        "Scheduled ingest: source threw, continuing with next",
      );
      totals.errors += 1;
      perSource.push({ sourceSlug: src.slug, ran: true, error: msg });
      sourcesRun++;
    }
  }

  const durationMs = Date.now() - start;
  const aggregateStatus: "success" | "partial" | "failed" =
    totals.errors === 0
      ? "success"
      : totals.listingsAdded + totals.listingsUpdated === 0 && sourcesRun > 0
        ? "failed"
        : "partial";
  await db
    .update(ingestionLogsTable)
    .set({
      status: aggregateStatus,
      recordsSeen: totals.listingsFound,
      recordsCreated: totals.listingsAdded,
      recordsUpdated: totals.listingsUpdated,
      errorMessage:
        totals.errors > 0
          ? `${totals.errors} per-source error(s) across ${sourcesRun} run / ${sourcesSkipped} skipped sources`
          : null,
      completedAt: new Date(),
    })
    .where(eq(ingestionLogsTable.id, aggregateLog.id));

  logger.info(
    {
      durationMs,
      sourcesRun,
      sourcesSkipped,
      totals,
      aggregateLogId: aggregateLog.id,
      perSource: perSource.map((p) => ({
        slug: p.sourceSlug,
        ran: p.ran,
        skipReason: p.skipReason,
      })),
    },
    "Scheduled ingest tick finished",
  );

  return {
    ran: true,
    durationMs,
    sourcesRun,
    sourcesSkipped,
    totals,
    perSource,
  };
}

/**
 * Run a digest send cycle under an advisory lock. The digest itself is
 * idempotent: only alerts that Resend confirms get flipped to "sent", so a
 * partially-completed run leaves the rest as "pending" for the next tick to
 * retry. The lock just stops two scheduler ticks from racing each other.
 */
export async function runScheduledDigest(): Promise<ScheduledDigestSummary> {
  const start = Date.now();
  const result = await withDigestLock(() => doScheduledDigest(start));
  if (!result.acquired) {
    logger.info(
      { lockKey: LOCK_KEY_DIGEST },
      "Skipping scheduled digest — previous run still in progress",
    );
    return { ran: false, reason: "locked", durationMs: 0 };
  }
  return result.value;
}

async function doScheduledDigest(start: number): Promise<ScheduledDigestSummary> {
  // Open a digest summary row in ingestion_logs (source_id null because this
  // isn't source-scoped). Records seen/created/updated map to digest counts:
  //   recordsSeen    -> alerts pending at start of run
  //   recordsCreated -> alerts successfully sent
  //   recordsUpdated -> alerts skipped (opted out / no email)
  // The admin ingestion-log feed surfaces these alongside per-source rows so
  // the same view shows recent ingest + digest activity.
  const [digestLog] = await db
    .insert(ingestionLogsTable)
    .values({
      sourceId: null,
      jobType: "scheduled_digest",
      status: "running",
    })
    .returning({ id: ingestionLogsTable.id });

  try {
    logger.info({ digestLogId: digestLog.id }, "Scheduled digest starting");
    const digest = await runDigest({ dryRun: false });
    const durationMs = Date.now() - start;

    let status: "success" | "partial" | "failed";
    let errorMessage: string | null = null;
    if (digest.aborted) {
      status = "failed";
      errorMessage = digest.aborted.reason.slice(0, 500);
    } else if (digest.alertsFailed > 0) {
      status = digest.alertsSent > 0 ? "partial" : "failed";
      errorMessage = `${digest.alertsFailed} alert send(s) failed`;
    } else {
      status = "success";
    }

    await db
      .update(ingestionLogsTable)
      .set({
        status,
        recordsSeen: digest.pendingFound,
        recordsCreated: digest.alertsSent,
        recordsUpdated: digest.alertsSkipped,
        errorMessage,
        completedAt: new Date(),
      })
      .where(eq(ingestionLogsTable.id, digestLog.id));

    logger.info(
      {
        durationMs,
        digestLogId: digestLog.id,
        pendingFound: digest.pendingFound,
        alertsSent: digest.alertsSent,
        alertsFailed: digest.alertsFailed,
        alertsSkipped: digest.alertsSkipped,
        usersNotified: digest.usersNotified,
        byFrequency: digest.byFrequency,
        aborted: digest.aborted ?? null,
      },
      "Scheduled digest finished",
    );
    return { ran: true, durationMs, digest };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestionLogsTable)
      .set({
        status: "failed",
        errorMessage: msg.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(ingestionLogsTable.id, digestLog.id));
    throw err;
  }
}

/**
 * Verify Postgres connectivity at scheduler boot so we fail fast instead of
 * letting every tick discover the same broken DB on its own.
 */
async function pingDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}

function parseEnvBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw);
}

function parseEnvPositiveNumber(
  name: string,
  defaultValue: number,
): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    logger.warn(
      { name, raw, defaultValue },
      "Invalid env value, falling back to default",
    );
    return defaultValue;
  }
  return n;
}

export type SchedulerConfig = {
  enabled: boolean;
  ingestIntervalMs: number;
  digestIntervalMs: number;
};

/**
 * Resolve scheduler config from env.
 *
 * `INGEST_INTERVAL_MINUTES` is the *tick* interval — how often the scheduler
 * wakes up to check which sources are due. Each source then runs only if its
 * own `cadence_minutes` (stored on the `sources` row) has elapsed since
 * `last_ingest_at`. Default 5 min so a 15-min source is only ever ~5 min
 * late but a 60-min source still only runs hourly. Digest cadence is
 * single-purpose and stays a flat interval.
 */
export function resolveSchedulerConfig(): SchedulerConfig {
  const enabled = parseEnvBool("SCHEDULER_ENABLED", true);
  const ingestMinutes = parseEnvPositiveNumber("INGEST_INTERVAL_MINUTES", 5);
  const digestMinutes = parseEnvPositiveNumber("DIGEST_INTERVAL_MINUTES", 30);
  return {
    enabled,
    ingestIntervalMs: Math.round(ingestMinutes * 60_000),
    digestIntervalMs: Math.round(digestMinutes * 60_000),
  };
}

let started = false;

/**
 * Start the in-process scheduler. Idempotent — safe to call multiple times.
 *
 * We use `setInterval` rather than a cron library to keep the dependency
 * surface small. Each tick is wrapped in try/catch so a single failure
 * never kills the interval.
 *
 * For production we recommend pairing this with a Replit Scheduled
 * Deployment that calls `src/scripts/run-scheduled.ts` directly — that
 * gives a stronger guarantee than relying on the long-lived API server
 * staying warm. Both paths share the same advisory locks so they cannot
 * double-fire.
 */
export function startScheduler(): void {
  if (started) {
    logger.warn("startScheduler called more than once — ignoring");
    return;
  }
  const cfg = resolveSchedulerConfig();
  if (!cfg.enabled) {
    logger.info(
      { cfg },
      "Scheduler disabled (SCHEDULER_ENABLED=false), not registering intervals",
    );
    started = true;
    return;
  }

  logger.info(
    {
      ingestIntervalMs: cfg.ingestIntervalMs,
      digestIntervalMs: cfg.digestIntervalMs,
    },
    "Starting in-process scheduler",
  );

  pingDatabase().catch((err) => {
    logger.error({ err }, "Scheduler DB connectivity check failed at boot");
  });

  const ingestTick = (): void => {
    runScheduledIngest().catch((err) => {
      logger.error({ err }, "Scheduled ingest tick threw");
    });
  };
  const digestTick = (): void => {
    runScheduledDigest().catch((err) => {
      logger.error({ err }, "Scheduled digest tick threw");
    });
  };

  const ingestTimer = setInterval(ingestTick, cfg.ingestIntervalMs);
  const digestTimer = setInterval(digestTick, cfg.digestIntervalMs);
  // Don't keep the event loop alive solely for the scheduler.
  ingestTimer.unref?.();
  digestTimer.unref?.();
  started = true;
}
