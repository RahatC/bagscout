import app from "./app";
import { logger } from "./lib/logger";
import { autoSeedIfEmpty } from "./lib/ingest";

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
});
