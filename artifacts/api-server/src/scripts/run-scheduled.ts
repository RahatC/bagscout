/**
 * Standalone entry-point for Replit Scheduled Deployments.
 *
 * Runs one ingest cycle followed by one digest cycle and exits. Both phases
 * use the same advisory locks as the in-process scheduler, so this can be
 * scheduled even while the long-running API server is also up — neither will
 * double-fire.
 *
 * Recommended cron in the Scheduled Deployment config:
 *   - Ingest+digest combined: every 30–60 minutes
 *
 * To use this with Replit Scheduled Deployments, point the deployment's run
 * command at this script (build with `pnpm --filter @workspace/api-server
 * run build`, then run with `node ./dist/run-scheduled.mjs` or invoke via
 * `tsx`).
 */
import { runMigrations } from "@workspace/db";
import { logger } from "../lib/logger";
import { runScheduledIngest, runScheduledDigest } from "../lib/scheduler";

async function main(): Promise<void> {
  // Keep migrations idempotent at the start so this script is safe to run
  // independently of the API server's startup path.
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, "Scheduled run: migrations failed");
    process.exit(1);
  }

  const ingestSummary = await runScheduledIngest();
  logger.info({ ingestSummary }, "Scheduled run: ingest phase complete");

  const digestSummary = await runScheduledDigest();
  logger.info({ digestSummary }, "Scheduled run: digest phase complete");
}

main()
  .then(() => {
    // Force exit so any lingering pg pool / pino worker doesn't keep us alive.
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, "Scheduled run: unhandled error");
    process.exit(1);
  });
