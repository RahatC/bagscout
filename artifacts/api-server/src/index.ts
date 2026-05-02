import path from "node:path";
import { fileURLToPath } from "node:url";
import { initSentry } from "./lib/sentry";

initSentry();

import { runMigrations } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { autoSeedIfEmpty } from "./lib/ingest";
import { startScheduler } from "./lib/scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Resolve migrations folder. In production the build step copies
// `lib/db/drizzle` next to the bundled entry (./dist/drizzle). In dev
// the source-relative path resolves back to lib/db/drizzle.
const here = path.dirname(fileURLToPath(import.meta.url));
const candidateMigrationsFolders = [
  path.resolve(here, "./drizzle"),
  path.resolve(here, "../../../lib/db/drizzle"),
];

async function start(): Promise<void> {
  try {
    await runMigrations({ migrationsFolder: candidateMigrationsFolders[0] });
  } catch (err) {
    // Fall back to the dev-source path before giving up.
    try {
      await runMigrations({ migrationsFolder: candidateMigrationsFolders[1] });
    } catch (innerErr) {
      logger.error(
        { err, innerErr, candidateMigrationsFolders },
        "Failed to apply database migrations on startup",
      );
      process.exit(1);
    }
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Auto-seed listings on first startup (no-op if data already exists).
    // Runs after the server is accepting requests so admin endpoints stay live.
    autoSeedIfEmpty().catch((err) => {
      logger.error({ err }, "Auto-seed failed");
    });

    // Kick off the in-process scheduler. Reads SCHEDULER_ENABLED,
    // INGEST_INTERVAL_MINUTES, DIGEST_INTERVAL_MINUTES from env. Safe to
    // disable via SCHEDULER_ENABLED=false (e.g. when relying on a Replit
    // Scheduled Deployment instead).
    try {
      startScheduler();
    } catch (err) {
      logger.error({ err }, "Failed to start scheduler");
    }
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during server startup");
  process.exit(1);
});
