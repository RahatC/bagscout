import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import {
  brandsTable,
  colorsTable,
  conditionsTable,
  sizesTable,
  bagStylesTable,
  sourcesTable,
} from "./schema";

/**
 * Canonical reference data for BagScout (brands, colors, conditions, sizes,
 * styles). This is the single source of truth used by BOTH:
 *
 *   - production startup seeding (`artifacts/api-server/src/index.ts`), and
 *   - the per-worker test database setup (`test-utils/seed.ts`).
 *
 * Keeping it here in `@workspace/db` guarantees a fresh production database
 * gets the same reference rows the onboarding / matching code depends on —
 * without it, `/api/reference/*` returns empty arrays and onboarding can
 * never be completed.
 *
 * Color `family` values feed the match engine's close-color logic, and
 * condition `rank` (lower = better) feeds the condition hard gate, so these
 * must stay consistent with `lib/matchEngine.ts`.
 */

export const REFERENCE_BRANDS = [
  { name: "Chanel", slug: "chanel", normalizedName: "chanel" },
  { name: "Louis Vuitton", slug: "louis-vuitton", normalizedName: "louis vuitton" },
  { name: "Hermès", slug: "herm-s", normalizedName: "hermes" },
  { name: "Dior", slug: "dior", normalizedName: "dior" },
  { name: "Gucci", slug: "gucci", normalizedName: "gucci" },
  { name: "Prada", slug: "prada", normalizedName: "prada" },
  { name: "Saint Laurent", slug: "saint-laurent", normalizedName: "saint laurent" },
  { name: "Celine", slug: "celine", normalizedName: "celine" },
  { name: "Goyard", slug: "goyard", normalizedName: "goyard" },
  { name: "Bottega Veneta", slug: "bottega-veneta", normalizedName: "bottega veneta" },
  { name: "Fendi", slug: "fendi", normalizedName: "fendi" },
  { name: "Loewe", slug: "loewe", normalizedName: "loewe" },
  { name: "Miu Miu", slug: "miu-miu", normalizedName: "miu miu" },
] as const;

export const REFERENCE_COLORS = [
  { name: "Black", slug: "black", normalizedName: "black", family: "neutrals" },
  { name: "Brown", slug: "brown", normalizedName: "brown", family: "neutrals" },
  { name: "Beige", slug: "beige", normalizedName: "beige", family: "neutrals" },
  { name: "Tan", slug: "tan", normalizedName: "tan", family: "neutrals" },
  { name: "White", slug: "white", normalizedName: "white", family: "neutrals" },
  { name: "Cream", slug: "cream", normalizedName: "cream", family: "neutrals" },
  { name: "Gray", slug: "gray", normalizedName: "gray", family: "neutrals" },
  { name: "Navy", slug: "navy", normalizedName: "navy", family: "blues" },
  { name: "Blue", slug: "blue", normalizedName: "blue", family: "blues" },
  { name: "Red", slug: "red", normalizedName: "red", family: "reds" },
  { name: "Burgundy", slug: "burgundy", normalizedName: "burgundy", family: "reds" },
  { name: "Pink", slug: "pink", normalizedName: "pink", family: "pinks" },
  { name: "Green", slug: "green", normalizedName: "green", family: "greens" },
  { name: "Gold", slug: "gold", normalizedName: "gold", family: "metallics" },
  { name: "Silver", slug: "silver", normalizedName: "silver", family: "metallics" },
] as const;

export const REFERENCE_CONDITIONS = [
  { name: "New with Tags", slug: "new-with-tags", normalizedName: "new with tags", rank: 1 },
  { name: "Pristine", slug: "pristine", normalizedName: "pristine", rank: 2 },
  { name: "Excellent", slug: "excellent", normalizedName: "excellent", rank: 3 },
  { name: "Very Good", slug: "very-good", normalizedName: "very good", rank: 4 },
  { name: "Good", slug: "good", normalizedName: "good", rank: 5 },
  { name: "Fair", slug: "fair", normalizedName: "fair", rank: 6 },
] as const;

export const REFERENCE_SIZES = [
  { name: "Mini", slug: "mini", normalizedName: "mini" },
  { name: "Small", slug: "small", normalizedName: "small" },
  { name: "Medium", slug: "medium", normalizedName: "medium" },
  { name: "Large", slug: "large", normalizedName: "large" },
  { name: "Jumbo", slug: "jumbo", normalizedName: "jumbo" },
  { name: "XL", slug: "xl", normalizedName: "xl" },
  { name: "Birkin 25", slug: "birkin-25", normalizedName: "birkin 25" },
  { name: "Birkin 30", slug: "birkin-30", normalizedName: "birkin 30" },
  { name: "Birkin 35", slug: "birkin-35", normalizedName: "birkin 35" },
  { name: "Kelly 25", slug: "kelly-25", normalizedName: "kelly 25" },
  { name: "Kelly 28", slug: "kelly-28", normalizedName: "kelly 28" },
  { name: "Kelly 32", slug: "kelly-32", normalizedName: "kelly 32" },
  { name: "PM", slug: "pm", normalizedName: "pm" },
  { name: "MM", slug: "mm", normalizedName: "mm" },
  { name: "GM", slug: "gm", normalizedName: "gm" },
] as const;

export const REFERENCE_STYLES = [
  { name: "Crossbody", slug: "crossbody", normalizedName: "crossbody" },
  { name: "Shoulder Bag", slug: "shoulder-bag", normalizedName: "shoulder bag" },
  { name: "Tote", slug: "tote", normalizedName: "tote" },
  { name: "Top Handle", slug: "top-handle", normalizedName: "top handle" },
  { name: "Hobo", slug: "hobo", normalizedName: "hobo" },
  { name: "Bucket Bag", slug: "bucket-bag", normalizedName: "bucket bag" },
  { name: "Backpack", slug: "backpack", normalizedName: "backpack" },
  { name: "Clutch", slug: "clutch", normalizedName: "clutch" },
  { name: "Evening Bag", slug: "evening-bag", normalizedName: "evening bag" },
  { name: "Travel/Luggage", slug: "travel-luggage", normalizedName: "travel/luggage" },
  { name: "Belt Bag", slug: "belt-bag", normalizedName: "belt bag" },
] as const;

/**
 * Marketplace sources. `ingestionMode` reflects the documented intent
 * (eBay/FASHIONPHILE/Rebag are live-capable; The RealReal & Yoogi's Closet
 * stay mock until a partner/affiliate program is wired in). NOTE: live mode is
 * only honored at runtime when `INGEST_USE_MOCK_ADAPTERS=false` is explicitly
 * set (see `adapters/index.ts`); the default is mock-only, so seeding these as
 * 'live' does NOT cause any scraping on a fresh deploy. Without these rows a
 * fresh database has no sources, so no listings ingest and `/listings` is
 * empty.
 */
export const REFERENCE_SOURCES = [
  {
    name: "eBay",
    slug: "ebay",
    baseUrl: "https://www.ebay.com",
    ingestionMode: "live",
  },
  {
    name: "FASHIONPHILE",
    slug: "fashionphile",
    baseUrl: "https://www.fashionphile.com",
    ingestionMode: "live",
  },
  {
    name: "Rebag",
    slug: "rebag",
    baseUrl: "https://www.rebag.com",
    ingestionMode: "live",
  },
  {
    name: "The RealReal",
    slug: "therealreal",
    baseUrl: "https://www.therealreal.com",
    ingestionMode: "mock",
  },
  {
    name: "Yoogi's Closet",
    slug: "yoogiscloset",
    baseUrl: "https://www.yoogiscloset.com",
    ingestionMode: "mock",
  },
] as const;

export type ReferenceSeedSummary = {
  brands: number;
  colors: number;
  conditions: number;
  sizes: number;
  styles: number;
  sources: number;
};

/**
 * Idempotently insert the canonical reference rows. Safe to run on every
 * startup: each insert is `ON CONFLICT DO NOTHING` keyed on the table's
 * unique slug/name constraints, so existing rows are never modified or
 * duplicated. Returns the dataset sizes for logging.
 */
export async function seedReferenceData(
  database: NodePgDatabase<typeof schema>,
): Promise<ReferenceSeedSummary> {
  await database.insert(brandsTable).values([...REFERENCE_BRANDS]).onConflictDoNothing();
  await database.insert(colorsTable).values([...REFERENCE_COLORS]).onConflictDoNothing();
  await database
    .insert(conditionsTable)
    .values([...REFERENCE_CONDITIONS])
    .onConflictDoNothing();
  await database.insert(sizesTable).values([...REFERENCE_SIZES]).onConflictDoNothing();
  await database.insert(bagStylesTable).values([...REFERENCE_STYLES]).onConflictDoNothing();
  await database.insert(sourcesTable).values([...REFERENCE_SOURCES]).onConflictDoNothing();

  return {
    brands: REFERENCE_BRANDS.length,
    colors: REFERENCE_COLORS.length,
    conditions: REFERENCE_CONDITIONS.length,
    sizes: REFERENCE_SIZES.length,
    styles: REFERENCE_STYLES.length,
    sources: REFERENCE_SOURCES.length,
  };
}
