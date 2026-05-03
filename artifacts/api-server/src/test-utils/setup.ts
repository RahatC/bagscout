import pg from "pg";
import { seedReferenceData } from "./seed.js";

const { Pool } = pg;

const FLAG = "__bagscout_test_db_initialized__";

function buildWorkerDatabaseUrl(baseUrl: string, workerId: string): {
  workerUrl: string;
  workerDbName: string;
  adminUrl: string;
} {
  const url = new URL(baseUrl);
  const baseDb = url.pathname.replace(/^\//, "") || "postgres";
  const workerDbName = `${baseDb}_test_w${workerId}`;

  const workerUrlObj = new URL(baseUrl);
  workerUrlObj.pathname = `/${workerDbName}`;

  const adminUrlObj = new URL(baseUrl);
  adminUrlObj.pathname = "/postgres";

  return {
    workerUrl: workerUrlObj.toString(),
    workerDbName,
    adminUrl: adminUrlObj.toString(),
  };
}

async function recreateDatabase(adminUrl: string, dbName: string): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
}

const baseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL must be set to run tests.",
  );
}

const workerId = process.env.VITEST_POOL_ID ?? "1";
const { workerUrl, workerDbName, adminUrl } = buildWorkerDatabaseUrl(
  baseUrl,
  workerId,
);

// Mutate DATABASE_URL BEFORE @workspace/db is imported so its singleton pool
// connects to the per-worker database.
process.env.DATABASE_URL = workerUrl;

const g = globalThis as unknown as Record<string, unknown>;
if (!g[FLAG]) {
  g[FLAG] = (async () => {
    await recreateDatabase(adminUrl, workerDbName);
    const { runMigrations } = await import("@workspace/db");
    await runMigrations({ databaseUrl: workerUrl });
    await seedReferenceData(workerUrl);
  })();
}

await g[FLAG];
