import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  sourcesTable,
  listingsTable,
  ingestionLogsTable,
} from "@workspace/db";
import { TriggerIngestBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { runMockIngest, runAllIngests } from "../lib/ingest";
import { count } from "drizzle-orm";

const router = Router();

// All admin endpoints require both auth + admin role.
router.use(requireAuth, requireAdmin);

router.get("/sources", async (_req, res) => {
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

router.get("/ingestion-logs", async (req, res) => {
  const raw = parseInt((req.query.limit as string) ?? "50", 10);
  if (req.query.limit != null && (isNaN(raw) || raw < 1)) {
    res.status(400).json({ error: "Invalid limit" });
    return;
  }
  const limit = Math.min(Number.isNaN(raw) ? 50 : raw, 200);

  const rows = await db
    .select({
      log: ingestionLogsTable,
      sourceName: sourcesTable.name,
    })
    .from(ingestionLogsTable)
    .innerJoin(sourcesTable, eq(ingestionLogsTable.sourceId, sourcesTable.id))
    .orderBy(desc(ingestionLogsTable.startedAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      ...r.log,
      sourceName: r.sourceName,
    })),
  );
});

router.post("/ingest", async (req, res) => {
  const parsed = TriggerIngestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  // Special slug "all" runs every registered adapter sequentially.
  if (parsed.data.sourceSlug === "all") {
    const results = await runAllIngests();
    const totals = results.reduce(
      (acc, r) => {
        acc.listingsFound += r.listingsFound;
        acc.listingsAdded += r.listingsAdded;
        acc.listingsUpdated += r.listingsUpdated;
        acc.durationMs += r.durationMs;
        acc.errors.push(...r.errors);
        return acc;
      },
      {
        sourceSlug: "all",
        listingsFound: 0,
        listingsAdded: 0,
        listingsUpdated: 0,
        durationMs: 0,
        errors: [] as string[],
      },
    );
    res.json({ ...totals, perSource: results });
    return;
  }
  const result = await runMockIngest(parsed.data.sourceSlug);
  res.json(result);
});

export default router;
