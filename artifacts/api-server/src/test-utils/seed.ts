import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  brandsTable,
  colorsTable,
  conditionsTable,
  sizesTable,
  bagStylesTable,
} from "@workspace/db/schema";

const { Pool } = pg;

const BRANDS = [
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
];

const COLORS = [
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
];

const CONDITIONS = [
  { name: "New with Tags", slug: "new-with-tags", normalizedName: "new with tags", rank: 1 },
  { name: "Pristine", slug: "pristine", normalizedName: "pristine", rank: 2 },
  { name: "Excellent", slug: "excellent", normalizedName: "excellent", rank: 3 },
  { name: "Very Good", slug: "very-good", normalizedName: "very good", rank: 4 },
  { name: "Good", slug: "good", normalizedName: "good", rank: 5 },
  { name: "Fair", slug: "fair", normalizedName: "fair", rank: 6 },
];

const SIZES = [
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
];

const STYLES = [
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
];

export async function seedReferenceData(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    await db.insert(brandsTable).values(BRANDS).onConflictDoNothing();
    await db.insert(colorsTable).values(COLORS).onConflictDoNothing();
    await db.insert(conditionsTable).values(CONDITIONS).onConflictDoNothing();
    await db.insert(sizesTable).values(SIZES).onConflictDoNothing();
    await db.insert(bagStylesTable).values(STYLES).onConflictDoNothing();
  } finally {
    await pool.end();
  }
}
