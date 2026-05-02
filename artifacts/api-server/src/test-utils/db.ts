import { sql } from "drizzle-orm";
import {
  db,
  usersTable,
  brandsTable,
  bagStylesTable,
  colorsTable,
  sizesTable,
  conditionsTable,
  sourcesTable,
  listingsTable,
  bagPreferencesTable,
  alertsTable,
  matchResultsTable,
  listingSnapshotsTable,
  ingestionLogsTable,
} from "@workspace/db";

export const TEST_USER_PREFIX = "test_user_";

export function makeTestUserId(): string {
  return `${TEST_USER_PREFIX}${Math.random().toString(36).slice(2, 12)}`;
}

export async function ensureTestUser(userId: string): Promise<void> {
  await db
    .insert(usersTable)
    .values({ id: userId, email: `${userId}@test.local`, fullName: "Test User" })
    .onConflictDoNothing();
}

/**
 * Wipe everything created by tests. Reference data (brands, colors, sources,
 * etc.) is left intact because it's seeded by migrations and shared with the
 * dev DB. We delete by user-id prefix and by the test source slug to avoid
 * touching real data.
 */
export async function cleanupTestData(opts: {
  testSourceSlug?: string;
} = {}): Promise<void> {
  // Delete listings (and cascading snapshots/match_results/alerts) belonging
  // to the test source, then drop the test source itself.
  if (opts.testSourceSlug) {
    const [src] = await db
      .select({ id: sourcesTable.id })
      .from(sourcesTable)
      .where(sql`${sourcesTable.slug} = ${opts.testSourceSlug}`);
    if (src) {
      const listingIds = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(sql`${listingsTable.sourceId} = ${src.id}`);
      const ids = listingIds.map((l) => l.id);
      if (ids.length > 0) {
        await db.delete(alertsTable).where(sql`${alertsTable.listingId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
        await db.delete(matchResultsTable).where(sql`${matchResultsTable.listingId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
        await db.delete(listingSnapshotsTable).where(sql`${listingSnapshotsTable.listingId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
        await db.delete(listingsTable).where(sql`${listingsTable.sourceId} = ${src.id}`);
      }
      await db.delete(ingestionLogsTable).where(sql`${ingestionLogsTable.sourceId} = ${src.id}`);
      await db.delete(sourcesTable).where(sql`${sourcesTable.id} = ${src.id}`);
    }
  }

  // Delete every user with the test prefix; cascading FKs clean up
  // bag_preferences, junctions, alerts, match_results, saved_listings.
  await db
    .delete(usersTable)
    .where(sql`${usersTable.id} LIKE ${TEST_USER_PREFIX + "%"}`);
}

export async function refLookups() {
  const [brands, styles, colors, sizes, conditions] = await Promise.all([
    db.select().from(brandsTable),
    db.select().from(bagStylesTable),
    db.select().from(colorsTable),
    db.select().from(sizesTable),
    db.select().from(conditionsTable),
  ]);

  return {
    brand: (normalized: string) => {
      const r = brands.find((b) => b.normalizedName === normalized);
      if (!r) throw new Error(`Missing brand "${normalized}" in seed data`);
      return r;
    },
    style: (normalized: string) => {
      const r = styles.find((s) => s.normalizedName === normalized);
      if (!r) throw new Error(`Missing style "${normalized}" in seed data`);
      return r;
    },
    color: (normalized: string) => {
      const r = colors.find((c) => c.normalizedName === normalized);
      if (!r) throw new Error(`Missing color "${normalized}" in seed data`);
      return r;
    },
    size: (normalized: string) => {
      const r = sizes.find((s) => s.normalizedName === normalized);
      if (!r) throw new Error(`Missing size "${normalized}" in seed data`);
      return r;
    },
    condition: (normalized: string) => {
      const r = conditions.find((c) => c.normalizedName === normalized);
      if (!r) throw new Error(`Missing condition "${normalized}" in seed data`);
      return r;
    },
  };
}

export async function ensureTestSource(slug: string, name: string): Promise<number> {
  const existing = await db
    .select()
    .from(sourcesTable)
    .where(sql`${sourcesTable.slug} = ${slug}`);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(sourcesTable)
    .values({
      slug,
      name,
      baseUrl: "https://test.local",
      sourceType: "resale_marketplace",
      ingestionMode: "mock",
      complianceStatus: "approved",
      active: true,
    })
    .returning({ id: sourcesTable.id });
  return row.id;
}
