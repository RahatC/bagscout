import { sql, eq } from "drizzle-orm";
import { db, pool, ingestionLogsTable } from "@workspace/db";
import { runAllIngests } from "./ingest";
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
  totals: {
    listingsFound: number;
    listingsAdded: number;
    listingsUpdated: number;
    listingsRejected: number;
    errors: number;
  };
};

export type ScheduledDigestSummary = {
  ran: boolean;
  reason?: "locked" | "disabled";
  durationMs: number;
  digest?: DigestRunResult;
};

/**
 * Run a full ingest cycle (every adapter, sequentially) under an advisory
 * lock so concurrent ticks no-op rather than overlap. Each per-source result
 * is already persisted to `ingestion_logs` by `runMockIngest`.
 */
export async function runScheduledIngest(): Promise<ScheduledIngestSummary> {
  const start = Date.now();
  const result = await withIngestLock(() => doScheduledIngest(start));
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
      totals: {
        listingsFound: 0,
        listingsAdded: 0,
        listingsUpdated: 0,
        listingsRejected: 0,
        errors: 0,
      },
    };
  }
  return result.value;
}

async function doScheduledIngest(start: number): Promise<ScheduledIngestSummary> {
  // Open an aggregate scheduled_run row up-front. source_id is null because
  // this represents the whole cycle (per-source rows are still written by
  // runMockIngest). The admin ingestion-log feed surfaces both shapes.
  const [aggregateLog] = await db
    .insert(ingestionLogsTable)
    .values({
      sourceId: null,
      jobType: "scheduled_run",
      status: "running",
    })
    .returning({ id: ingestionLogsTable.id });

  try {
    logger.info({ aggregateLogId: aggregateLog.id }, "Scheduled ingest starting");
    const results = await runAllIngests({ jobType: "scheduled" });
    const totals = results.reduce(
      (acc, r) => {
        acc.listingsFound += r.listingsFound;
        acc.listingsAdded += r.listingsAdded;
        acc.listingsUpdated += r.listingsUpdated;
        acc.listingsRejected += r.listingsRejected;
        acc.errors += r.errors.length;
        return acc;
      },
      {
        listingsFound: 0,
        listingsAdded: 0,
        listingsUpdated: 0,
        listingsRejected: 0,
        errors: 0,
      },
    );
    const durationMs = Date.now() - start;
    const status: "success" | "partial" | "failed" =
      totals.errors === 0
        ? "success"
        : totals.listingsAdded + totals.listingsUpdated === 0
          ? "failed"
          : "partial";
    await db
      .update(ingestionLogsTable)
      .set({
        status,
        recordsSeen: totals.listingsFound,
        recordsCreated: totals.listingsAdded,
        recordsUpdated: totals.listingsUpdated,
        errorMessage:
          totals.errors > 0
            ? `${totals.errors} per-source errors across ${results.length} sources`
            : null,
        completedAt: new Date(),
      })
      .where(eq(ingestionLogsTable.id, aggregateLog.id));
    logger.info(
      { durationMs, sourcesRun: results.length, totals, aggregateLogId: aggregateLog.id },
      "Scheduled ingest finished",
    );
    return {
      ran: true,
      durationMs,
      sourcesRun: results.length,
      totals,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestionLogsTable)
      .set({
        status: "failed",
        errorMessage: msg.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(ingestionLogsTable.id, aggregateLog.id));
    throw err;
  }
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
 * Resolve scheduler config from env. Defaults are intentionally conservative
 * (60 min ingest / 30 min digest) so a fresh deployment doesn't hammer
 * upstream sources or burn email quota.
 */
export function resolveSchedulerConfig(): SchedulerConfig {
  const enabled = parseEnvBool("SCHEDULER_ENABLED", true);
  const ingestMinutes = parseEnvPositiveNumber("INGEST_INTERVAL_MINUTES", 60);
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
