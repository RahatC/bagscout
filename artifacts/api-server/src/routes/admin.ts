import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, sourcesTable, listingsTable } from "@workspace/db";
import { TriggerIngestBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { runMockIngest } from "../lib/ingest";
import { count } from "drizzle-orm";

const router = Router();

// GET /api/admin/sources
router.get("/sources", requireAuth, async (_req, res) => {
  const rows = await db
    .select({
      source: sourcesTable,
      listingCount: count(listingsTable.id),
    })
    .from(sourcesTable)
    .leftJoin(listingsTable, eq(listingsTable.sourceId, sourcesTable.id))
    .groupBy(sourcesTable.id)
    .orderBy(sourcesTable.name);

  res.json(
    rows.map((r) => ({
      ...r.source,
      listingCount: r.listingCount,
    })),
  );
});

// POST /api/admin/ingest
router.post("/ingest", requireAuth, async (req, res) => {
  const parsed = TriggerIngestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const result = await runMockIngest(parsed.data.sourceSlug);
  res.json(result);
});

export default router;
