import { Router } from "express";
import { eq, and, gte, lte, ilike, ne, sql, desc } from "drizzle-orm";
import { db, listingsTable, sourcesTable, colorsTable } from "@workspace/db";
import { mapListing } from "../lib/mappers";

const router = Router();

router.get("/featured", async (_req, res) => {
  const rows = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(listingsTable.availabilityStatus, "available"))
    .orderBy(sql`RANDOM()`)
    .limit(8);
  res.json(rows.map((r) => mapListing(r.listings, r.sources)));
});

router.get("/", async (req, res) => {
  const limitRaw = parseInt((req.query.limit as string) ?? "24", 10);
  if (req.query.limit != null && (isNaN(limitRaw) || limitRaw < 1)) {
    res.status(400).json({ error: "Invalid limit" });
    return;
  }
  const offsetRaw = parseInt((req.query.offset as string) ?? "0", 10);
  if (req.query.offset != null && (isNaN(offsetRaw) || offsetRaw < 0)) {
    res.status(400).json({ error: "Invalid offset" });
    return;
  }
  const limit = Math.min(Number.isNaN(limitRaw) ? 24 : limitRaw, 100);
  const offset = Number.isNaN(offsetRaw) ? 0 : offsetRaw;
  const brand = req.query.brand as string | undefined;
  const condition = req.query.condition as string | undefined;
  const color = req.query.color as string | undefined;
  const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
  const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
  if ((minPrice != null && (isNaN(minPrice) || minPrice < 0)) || (maxPrice != null && (isNaN(maxPrice) || maxPrice < 0))) {
    res.status(400).json({ error: "Invalid price range" });
    return;
  }
  const source = req.query.source as string | undefined;

  const conditions = [eq(listingsTable.availabilityStatus, "available")];
  if (brand) conditions.push(ilike(listingsTable.brand, `%${brand}%`));
  if (condition) conditions.push(ilike(listingsTable.condition!, `%${condition}%`));
  if (color) conditions.push(ilike(listingsTable.color!, `%${color}%`));
  if (minPrice != null) conditions.push(gte(listingsTable.price, String(minPrice)));
  if (maxPrice != null) conditions.push(lte(listingsTable.price, String(maxPrice)));
  if (source) conditions.push(ilike(sourcesTable.slug, source));

  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(whereClause);

  const rows = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(whereClause)
    .orderBy(listingsTable.lastSeenAt)
    .limit(limit)
    .offset(offset);

  res.json({
    items: rows.map((r) => mapListing(r.listings, r.sources)),
    total: count,
    limit,
    offset,
  });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(listingsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(mapListing(row.listings, row.sources));
});

/**
 * "Similar but cheaper": same brand + (style if available) + same color
 * family if known + equal-or-better condition rank, priced strictly lower.
 * Falls back to brand-only matching if the strict filter yields no results.
 */
router.get("/:id/similar-cheaper", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const limitRaw = parseInt((req.query.limit as string) ?? "6", 10);
  const limit = Math.min(Number.isNaN(limitRaw) || limitRaw < 1 ? 6 : limitRaw, 24);

  const [base] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, id));
  if (!base) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const conds = [
    eq(listingsTable.normalizedBrand, base.normalizedBrand),
    eq(listingsTable.availabilityStatus, "available"),
    ne(listingsTable.id, base.id),
    lte(listingsTable.price, sql`${base.price}::numeric - 1`),
  ];
  if (base.normalizedStyle) {
    conds.push(eq(listingsTable.normalizedStyle, base.normalizedStyle));
  }

  // Optional color-family filter — only applied when we can resolve a family.
  let familyFiltered = false;
  if (base.normalizedColor) {
    const [cf] = await db
      .select({ family: colorsTable.family })
      .from(colorsTable)
      .where(eq(colorsTable.normalizedName, base.normalizedColor));
    if (cf?.family) {
      familyFiltered = true;
      conds.push(
        sql`${listingsTable.normalizedColor} IN (
          SELECT ${colorsTable.normalizedName} FROM ${colorsTable}
          WHERE ${colorsTable.family} = ${cf.family}
        )`,
      );
    }
  }

  let rows = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(and(...conds))
    .orderBy(listingsTable.price)
    .limit(limit);

  // Fall back: drop color-family if too few results.
  if (rows.length === 0 && familyFiltered) {
    const fallbackConds = conds.slice(0, -1);
    rows = await db
      .select()
      .from(listingsTable)
      .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
      .where(and(...fallbackConds))
      .orderBy(listingsTable.price)
      .limit(limit);
  }

  res.json(rows.map((r) => mapListing(r.listings, r.sources)));
});

export default router;
