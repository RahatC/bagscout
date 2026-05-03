import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[db:migrate] ${msg}`);
};

/**
 * If a database was previously initialized via `drizzle-kit push` (no migration
 * journal exists), the baseline migration's CREATE TABLE statements would fail
 * because the tables already exist. To make the transition safe, we detect
 * this case and seed `drizzle.__drizzle_migrations` with the baseline entry
 * so the migrator skips it and only applies subsequent migrations.
 */
async function bootstrapBaselineIfNeeded(
  pool: pg.Pool,
  migrationsFolder: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    const migrationsTable = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
       ) AS exists`,
    );
    if (migrationsTable.rows[0]?.exists) {
      return;
    }

    const usersTable = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
       ) AS exists`,
    );
    if (!usersTable.rows[0]?.exists) {
      // Fresh database — let the migrator create everything from scratch.
      return;
    }

    const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const baseline = journal.entries[0];
    if (!baseline || baseline.tag !== "0000_baseline") {
      return;
    }

    const baselineSql = await readFile(
      path.join(migrationsFolder, `${baseline.tag}.sql`),
      "utf8",
    );
    const hash = createHash("sha256").update(baselineSql).digest("hex");

    log(
      "existing schema detected without a migration journal — seeding baseline as already applied",
    );
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
         id SERIAL PRIMARY KEY,
         hash text NOT NULL,
         created_at bigint
       )`,
    );
    // IMPORTANT: stamp `created_at` with the baseline's `folderMillis` from
    // the journal (not `Date.now()`). drizzle's migrator only applies
    // migrations whose folderMillis is greater than the latest stored
    // `created_at`; using `Date.now()` here would permanently skip every
    // subsequent migration on this database.
    await client.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, baseline.when],
    );
  } finally {
    client.release();
  }
}

export interface RunMigrationsOptions {
  databaseUrl?: string;
  migrationsFolder?: string;
}

export async function runMigrations(
  options: RunMigrationsOptions = {},
): Promise<void> {
  const url = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set to run migrations. Did you forget to provision a database?",
    );
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder =
    options.migrationsFolder ?? path.resolve(here, "../drizzle");

  const pool = new Pool({ connectionString: url });
  try {
    await bootstrapBaselineIfNeeded(pool, migrationsFolder);
    const db = drizzle(pool);
    log(`applying migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    log("migrations applied successfully");
  } finally {
    await pool.end();
  }
}

