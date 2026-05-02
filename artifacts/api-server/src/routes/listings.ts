import { Router } from "express";
import { eq, and, gte, lte, ilike, sql } from "drizzle-orm";
import { db, listingsTable, sourcesTable } from "@workspace/db";
import { ListListingsQueryParams, GetListingParams } from "@workspace/api-zod";

const router = Router();

function mapListing(l: typeof listingsTable.$inferSelect, source: typeof sourcesTable.$inferSelect) {
  return {
    ...l,
    sourceName: source.name,
    price: parseFloat(l.price),
    originalPrice: l.originalPrice ? parseFloat(l.originalPrice) : null,
  };
}

// GET /api/listings/featured (must be before /:id)
router.get("/featured", async (_req, res) => {
  const rows = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(listingsTable.isAvailable, true))
    .orderBy(sql`RANDOM()`)
    .limit(8);

  res.json(rows.map((r) => mapListing(r.listings, r.sources)));
});

// GET /api/listings
router.get("/", async (req, res) => {
  const parsed = ListListingsQueryParams.safeParse({
    ...req.query,
    limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const p = parsed.data;
  const conditions = [eq(listingsTable.isAvailable, true)];
  if (p.brand) conditions.push(ilike(listingsTable.brand, `%${p.brand}%`));
  if (p.model) conditions.push(ilike(listingsTable.model!, `%${p.model}%`));
  if (p.condition) conditions.push(eq(listingsTable.condition, p.condition));
  if (p.color) conditions.push(ilike(listingsTable.color!, `%${p.color}%`));
  if (p.minPrice != null) conditions.push(gte(listingsTable.price, String(p.minPrice)));
  if (p.maxPrice != null) conditions.push(lte(listingsTable.price, String(p.maxPrice)));

  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(whereClause);

  const rows = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(whereClause)
    .orderBy(listingsTable.seenAt)
    .limit(p.limit ?? 20)
    .offset(p.offset ?? 0);

  res.json({
    items: rows.map((r) => mapListing(r.listings, r.sources)),
    total: count,
    limit: p.limit ?? 20,
    offset: p.offset ?? 0,
  });
});

// GET /api/listings/:id
router.get("/:id", async (req, res) => {
  const parsed = GetListingParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(eq(listingsTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(mapListing(row.listings, row.sources));
});

export default router;
