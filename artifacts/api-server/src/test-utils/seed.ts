import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db/schema";
// Import from the pool-free `./reference` subpath (NOT the package root): the
// root entry constructs the shared pg Pool and asserts DATABASE_URL at import
// time, which would run before `setup.ts` sets the per-worker DATABASE_URL.
import { seedReferenceData as seedReferenceRows } from "@workspace/db/reference";

const { Pool } = pg;

/**
 * Seed the canonical reference rows into a test worker database.
 *
 * The reference datasets live in `@workspace/db` (`referenceData.ts`) so the
 * tests and production startup seed from the exact same source of truth.
 */
export async function seedReferenceData(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    await seedReferenceRows(db);
  } finally {
    await pool.end();
  }
}
