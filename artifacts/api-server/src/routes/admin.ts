import { Router } from "express";
import { eq, desc, count, and, gte, lte, isNotNull, ilike, or, asc, sql } from "drizzle-orm";
import {
  db,
  sourcesTable,
  listingsTable,
  ingestionLogsTable,
  brandsTable,
  colorsTable,
  conditionsTable,
  sizesTable,
  bagStylesTable,
  bagModelsTable,
  bagPreferencesTable,
  bagPreferenceBrandsTable,
  bagPreferenceStylesTable,
  bagPreferenceColorsTable,
  bagPreferenceSizesTable,
  matchResultsTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";
import {
  TriggerIngestBody,
  RunDigestsBody,
  UpdateSourceBody,
  ListAdminListingsQueryParams,
  DebugMatchBody,
  CreateTaxonomyBrandBody,
  CreateTaxonomyColorBody,
  CreateTaxonomyConditionBody,
  CreateTaxonomySizeBody,
  CreateTaxonomyStyleBody,
  CreateTaxonomyModelBody,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { adminWriteRateLimiter } from "../middlewares/security";
import { runMockIngest, runAllIngests } from "../lib/ingest";
import { withDigestLock, withIngestLock } from "../lib/scheduler";
import { runDigest } from "../lib/digest";
import {
  evaluateMatch,
  type PreferenceCriteria,
  type ListingFacts,
} from "../lib/matchEngine";
import { normalizeText, conditionRank } from "../lib/normalize";
import type { Request } from "express";

const router = Router();

// All admin endpoints require both auth + admin role.
router.use(requireAuth, requireAdmin);

type AuthRequest = Request & { userId: string };

// Reject unknown fields on POST bodies so typos don't silently no-op.
const TriggerIngestBodyStrict = TriggerIngestBody.strict();
const RunDigestsBodyStrict = RunDigestsBody.strict();
const UpdateSourceBodyStrict = UpdateSourceBody.strict();
const DebugMatchBodyStrict = DebugMatchBody.strict();
const CreateTaxonomyBrandBodyStrict = CreateTaxonomyBrandBody.strict();
const CreateTaxonomyColorBodyStrict = CreateTaxonomyColorBody.strict();
const CreateTaxonomyConditionBodyStrict = CreateTaxonomyConditionBody.strict();
const CreateTaxonomySizeBodyStrict = CreateTaxonomySizeBody.strict();
const CreateTaxonomyStyleBodyStrict = CreateTaxonomyStyleBody.strict();
const CreateTaxonomyModelBodyStrict = CreateTaxonomyModelBody.strict();
const IdParam = z.object({ id: z.coerce.number().int().positive() });

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const IngestionLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

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

// PATCH /api/admin/sources/:slug
// Update mutable per-source operational fields (currently cadenceMinutes
// and active). Lets ops tune polling frequency without redeploying or
// touching the DB directly.
router.patch("/sources/:slug", adminWriteRateLimiter, async (req, res) => {
  const slug = String(req.params.slug);
  const parsed = UpdateSourceBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const updates: { cadenceMinutes?: number; active?: boolean } = {};
  if (parsed.data.cadenceMinutes != null)
    updates.cadenceMinutes = parsed.data.cadenceMinutes;
  if (parsed.data.active != null) updates.active = parsed.data.active;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(sourcesTable)
    .set(updates)
    .where(eq(sourcesTable.slug, slug))
    .returning();
  if (!updated) {
    res.status(404).json({ error: `Source "${slug}" not found` });
    return;
  }
  res.json({ ...updated, listingCount: updated.listingCount });
});

router.get("/ingestion-logs", async (req, res) => {
  const parsed = IngestionLogsQuery.safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }
  const { limit } = parsed.data;

  const rows = await db
    .select({
      log: ingestionLogsTable,
      sourceName: sourcesTable.name,
    })
    .from(ingestionLogsTable)
    // LEFT JOIN: aggregate (scheduled_run) and digest (scheduled_digest) rows
    // have a NULL source_id; an INNER JOIN would silently hide them from the
    // admin feed.
    .leftJoin(sourcesTable, eq(ingestionLogsTable.sourceId, sourcesTable.id))
    .orderBy(desc(ingestionLogsTable.startedAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      ...r.log,
      sourceName: r.sourceName,
    })),
  );
});

// GET /api/admin/source-health
// Per-source freshness rollup powering the admin dashboard widget. For each
// source we compute the last successful run, latest error, and 24h activity
// counts so operators can spot silently broken scrapers without paging
// through the raw ingestion log feed.
router.get("/source-health", async (_req, res) => {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const sources = await db.select().from(sourcesTable).orderBy(sourcesTable.name);

  // Per-source last successful run timestamp.
  const lastSuccessRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      lastSuccessAt: sql<Date>`max(${ingestionLogsTable.completedAt})`.as(
        "last_success_at",
      ),
    })
    .from(ingestionLogsTable)
    .where(
      and(
        isNotNull(ingestionLogsTable.sourceId),
        eq(ingestionLogsTable.status, "success"),
      ),
    )
    .groupBy(ingestionLogsTable.sourceId);
  const lastSuccessBySource = new Map<number, Date>(
    lastSuccessRows
      .filter((r) => r.sourceId != null && r.lastSuccessAt != null)
      .map((r) => [r.sourceId as number, new Date(r.lastSuccessAt as Date)]),
  );

  // Per-source most recent run (any status).
  const lastRunRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      startedAt: sql<Date>`max(${ingestionLogsTable.startedAt})`.as("last_run_at"),
    })
    .from(ingestionLogsTable)
    .where(isNotNull(ingestionLogsTable.sourceId))
    .groupBy(ingestionLogsTable.sourceId);
  const lastRunStartBySource = new Map<number, Date>(
    lastRunRows
      .filter((r) => r.sourceId != null && r.startedAt != null)
      .map((r) => [r.sourceId as number, new Date(r.startedAt as Date)]),
  );

  // Resolve the actual last-run row to expose its status.
  const lastRunStatusBySource = new Map<
    number,
    { status: string; startedAt: Date }
  >();
  for (const [sourceId, startedAt] of lastRunStartBySource) {
    const [row] = await db
      .select({
        status: ingestionLogsTable.status,
        startedAt: ingestionLogsTable.startedAt,
      })
      .from(ingestionLogsTable)
      .where(
        and(
          eq(ingestionLogsTable.sourceId, sourceId),
          eq(ingestionLogsTable.startedAt, startedAt),
        ),
      )
      .limit(1);
    if (row) lastRunStatusBySource.set(sourceId, row);
  }

  // Per-source latest error (failed/partial with a non-null message).
  const lastErrorRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      errorMessage: ingestionLogsTable.errorMessage,
      startedAt: ingestionLogsTable.startedAt,
    })
    .from(ingestionLogsTable)
    .where(
      and(
        isNotNull(ingestionLogsTable.sourceId),
        isNotNull(ingestionLogsTable.errorMessage),
      ),
    )
    .orderBy(desc(ingestionLogsTable.startedAt));
  const lastErrorBySource = new Map<
    number,
    { errorMessage: string; startedAt: Date }
  >();
  for (const r of lastErrorRows) {
    if (r.sourceId == null || r.errorMessage == null) continue;
    if (!lastErrorBySource.has(r.sourceId)) {
      lastErrorBySource.set(r.sourceId, {
        errorMessage: r.errorMessage,
        startedAt: r.startedAt,
      });
    }
  }

  // 24h aggregates: total runs, failed runs, listings created.
  const aggRows = await db
    .select({
      sourceId: ingestionLogsTable.sourceId,
      runs: count(ingestionLogsTable.id),
      failures: sql<number>`count(*) filter (where ${ingestionLogsTable.status} = 'failed')`.as(
        "failures",
      ),
      listingsAdded: sql<number>`coalesce(sum(${ingestionLogsTable.recordsCreated}), 0)`.as(
        "listings_added",
      ),
    })
    .from(ingestionLogsTable)
    .where(
      and(
        isNotNull(ingestionLogsTable.sourceId),
        gte(ingestionLogsTable.startedAt, since24h),
      ),
    )
    .groupBy(ingestionLogsTable.sourceId);
  const aggBySource = new Map<
    number,
    { runs: number; failures: number; listingsAdded: number }
  >(
    aggRows
      .filter((r) => r.sourceId != null)
      .map((r) => [
        r.sourceId as number,
        {
          runs: Number(r.runs ?? 0),
          failures: Number(r.failures ?? 0),
          listingsAdded: Number(r.listingsAdded ?? 0),
        },
      ]),
  );

  const entries = sources.map((s) => {
    const lastSuccessAt = lastSuccessBySource.get(s.id) ?? null;
    const lastRun = lastRunStatusBySource.get(s.id) ?? null;
    const lastErr = lastErrorBySource.get(s.id) ?? null;
    const agg = aggBySource.get(s.id) ?? {
      runs: 0,
      failures: 0,
      listingsAdded: 0,
    };

    // Cadence-aware staleness threshold: if a source is supposed to run every
    // N minutes, anything older than 3*N (and at least 1h) without a fresh
    // success counts as stale/degraded.
    const staleAfterMs = Math.max(
      60 * 60 * 1000,
      s.cadenceMinutes * 60 * 1000 * 3,
    );
    const successWithin24h =
      lastSuccessAt != null && lastSuccessAt >= since24h;
    const successFresh =
      lastSuccessAt != null &&
      now.getTime() - lastSuccessAt.getTime() <= staleAfterMs;

    let status: "healthy" | "degraded" | "failed" | "idle";
    if (lastRun == null) {
      status = s.active ? "failed" : "idle";
    } else if (lastRun.status === "failed" && !successFresh) {
      status = "failed";
    } else if (!successWithin24h && s.active) {
      status = "failed";
    } else if (
      lastRun.status === "partial" ||
      lastRun.status === "failed" ||
      !successFresh
    ) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      sourceId: s.id,
      slug: s.slug,
      name: s.name,
      active: s.active,
      status,
      lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
      lastRunAt: lastRun ? lastRun.startedAt.toISOString() : null,
      lastRunStatus: lastRun ? lastRun.status : null,
      lastErrorAt: lastErr ? lastErr.startedAt.toISOString() : null,
      lastErrorMessage: lastErr ? lastErr.errorMessage : null,
      listingsAdded24h: agg.listingsAdded,
      runs24h: agg.runs,
      failures24h: agg.failures,
    };
  });

  // Banner trigger: no active source has succeeded in the last 24h. If there
  // are no active sources at all, treat as success (nothing to alarm about).
  const activeSources = entries.filter((e) => e.active);
  const anySuccessIn24h =
    activeSources.length === 0 ||
    activeSources.some(
      (e) => e.lastSuccessAt != null && new Date(e.lastSuccessAt) >= since24h,
    );

  res.json({
    generatedAt: now.toISOString(),
    anySuccessIn24h,
    sources: entries,
  });
});

router.post("/ingest", adminWriteRateLimiter, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = TriggerIngestBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  // Acquire the same advisory lock the scheduler uses so manual admin
  // triggers can never overlap with a scheduled tick (or with each other).
  // Returns 409 Conflict if a run is already in flight.
  const lockResult = await withIngestLock(async () => {
    // Audit row recording who triggered the run. Per-source rows from
    // runMockIngest still get written separately; this aggregate row is
    // what carries the actorUserId stamp for the admin trigger.
    const [auditLog] = await db
      .insert(ingestionLogsTable)
      .values({
        sourceId: null,
        jobType: "manual_admin",
        status: "running",
        actorUserId: userId,
      })
      .returning({ id: ingestionLogsTable.id });

    try {
      let value;
      let totalErrors = 0;
      let recordsSeen = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;
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
        value = { ...totals, perSource: results };
        totalErrors = totals.errors.length;
        recordsSeen = totals.listingsFound;
        recordsCreated = totals.listingsAdded;
        recordsUpdated = totals.listingsUpdated;
      } else {
        const result = await runMockIngest(parsed.data.sourceSlug);
        value = result;
        totalErrors = result.errors.length;
        recordsSeen = result.listingsFound;
        recordsCreated = result.listingsAdded;
        recordsUpdated = result.listingsUpdated;
      }

      const status: "success" | "partial" | "failed" =
        totalErrors === 0
          ? "success"
          : recordsCreated + recordsUpdated === 0
            ? "failed"
            : "partial";
      await db
        .update(ingestionLogsTable)
        .set({
          status,
          recordsSeen,
          recordsCreated,
          recordsUpdated,
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));

      return value;
    } catch (err) {
      await db
        .update(ingestionLogsTable)
        .set({
          status: "failed",
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(
            0,
            500,
          ),
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));
      throw err;
    }
  });
  if (!lockResult.acquired) {
    res.status(409).json({ error: "An ingest run is already in progress" });
    return;
  }
  res.json(lockResult.value);
});

// POST /api/admin/digests/run
// Send pending alerts via Resend, grouped per (user, alert). Respects the
// per-user notification_preferences row for channel="email" and the alert's
// alert_type. An alert is only flipped from "pending" -> "sent" after the
// Resend call returns a message id; failures are recorded so a later run can
// retry. Pass `dryRun: true` to render + log emails without calling Resend.
router.post("/digests/run", adminWriteRateLimiter, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = RunDigestsBodyStrict.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const dryRun = parsed.data.dryRun === true;
  // Acquire the same advisory lock the scheduler uses so manual digest
  // triggers can never overlap with a scheduled tick (or with each other).
  // Dry runs also take the lock so they can't race a real send.
  const lockResult = await withDigestLock(async () => {
    const [auditLog] = await db
      .insert(ingestionLogsTable)
      .values({
        sourceId: null,
        jobType: dryRun ? "manual_digest_dryrun" : "manual_digest",
        status: "running",
        actorUserId: userId,
      })
      .returning({ id: ingestionLogsTable.id });
    try {
      const result = await runDigest({ dryRun });
      const status: "success" | "partial" | "failed" = result.aborted
        ? "failed"
        : result.alertsFailed === 0
          ? "success"
          : result.alertsSent === 0
            ? "failed"
            : "partial";
      await db
        .update(ingestionLogsTable)
        .set({
          status,
          recordsSeen: result.alertsSent + result.alertsFailed + result.alertsSkipped,
          recordsCreated: result.alertsSent,
          recordsUpdated: result.alertsSkipped,
          errorMessage: result.aborted?.reason ?? null,
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));
      return result;
    } catch (err) {
      await db
        .update(ingestionLogsTable)
        .set({
          status: "failed",
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(
            0,
            500,
          ),
          completedAt: new Date(),
        })
        .where(eq(ingestionLogsTable.id, auditLog.id));
      throw err;
    }
  });
  if (!lockResult.acquired) {
    res.status(409).json({ error: "A digest run is already in progress" });
    return;
  }
  const result = lockResult.value;
  if (result.aborted) {
    res.status(503).json({ error: result.aborted.reason });
    return;
  }
  res.json(result);
});

// ─── Listing Explorer ───────────────────────────────────────────────────────
router.get("/listings", async (req, res) => {
  const parsed = ListAdminListingsQueryParams.strict().safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }
  const { limit, offset, q, source, brand, model, style, color, condition, minPrice, maxPrice, availability } =
    parsed.data;

  const conds = [];
  if (availability !== "all") {
    conds.push(eq(listingsTable.availabilityStatus, availability));
  }
  if (source) conds.push(eq(sourcesTable.slug, source));
  if (brand) conds.push(ilike(listingsTable.brand, `%${brand}%`));
  if (model) conds.push(ilike(listingsTable.model!, `%${model}%`));
  if (style) conds.push(ilike(listingsTable.style!, `%${style}%`));
  if (color) conds.push(ilike(listingsTable.color!, `%${color}%`));
  if (condition) conds.push(ilike(listingsTable.condition!, `%${condition}%`));
  if (minPrice != null) conds.push(gte(listingsTable.price, String(minPrice)));
  if (maxPrice != null) conds.push(lte(listingsTable.price, String(maxPrice)));
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(
        ilike(listingsTable.title, like),
        ilike(listingsTable.brand, like),
        ilike(listingsTable.model!, like),
        ilike(listingsTable.color!, like),
      )!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(where);

  const rows = await db
    .select({ l: listingsTable, s: sourcesTable })
    .from(listingsTable)
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .where(where)
    .orderBy(desc(listingsTable.lastSeenAt))
    .limit(limit)
    .offset(offset);

  res.json({
    items: rows.map(({ l, s }) => ({
      id: l.id,
      sourceId: l.sourceId,
      sourceName: s.name,
      sourceSlug: s.slug,
      sourceUrl: l.sourceUrl,
      sourceListingId: l.sourceListingId,
      title: l.title,
      brand: l.brand,
      model: l.model,
      style: l.style,
      condition: l.condition,
      color: l.color,
      size: l.size,
      normalizedBrand: l.normalizedBrand,
      normalizedModel: l.normalizedModel,
      normalizedStyle: l.normalizedStyle,
      normalizedCondition: l.normalizedCondition,
      normalizedColor: l.normalizedColor,
      price: parseFloat(l.price),
      currency: l.currency,
      imageUrl: l.imageUrl,
      availabilityStatus: l.availabilityStatus,
      firstSeenAt: l.firstSeenAt,
      lastSeenAt: l.lastSeenAt,
    })),
    total,
    limit,
    offset,
  });
});

// ─── Match Debugger ─────────────────────────────────────────────────────────
router.get("/preferences", async (_req, res) => {
  const rows = await db
    .select({
      id: bagPreferencesTable.id,
      userId: bagPreferencesTable.userId,
      nickname: bagPreferencesTable.nickname,
      active: bagPreferencesTable.active,
      alertFrequency: bagPreferencesTable.alertFrequency,
      userEmail: usersTable.email,
      userFullName: usersTable.fullName,
    })
    .from(bagPreferencesTable)
    .leftJoin(usersTable, eq(bagPreferencesTable.userId, usersTable.id))
    .orderBy(desc(bagPreferencesTable.createdAt));
  res.json(rows);
});

router.post("/match-debug", adminWriteRateLimiter, async (req, res) => {
  const parsed = DebugMatchBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { preferenceId, listingId } = parsed.data;

  const [pref] = await db
    .select()
    .from(bagPreferencesTable)
    .where(eq(bagPreferencesTable.id, preferenceId));
  if (!pref) {
    res.status(404).json({ error: "Preference not found" });
    return;
  }

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId));
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const [brands, styles, colors, sizes, condMin] = await Promise.all([
    db
      .select({ b: brandsTable })
      .from(bagPreferenceBrandsTable)
      .innerJoin(brandsTable, eq(bagPreferenceBrandsTable.brandId, brandsTable.id))
      .where(eq(bagPreferenceBrandsTable.preferenceId, pref.id)),
    db
      .select({ s: bagStylesTable })
      .from(bagPreferenceStylesTable)
      .innerJoin(bagStylesTable, eq(bagPreferenceStylesTable.styleId, bagStylesTable.id))
      .where(eq(bagPreferenceStylesTable.preferenceId, pref.id)),
    db
      .select({ c: colorsTable })
      .from(bagPreferenceColorsTable)
      .innerJoin(colorsTable, eq(bagPreferenceColorsTable.colorId, colorsTable.id))
      .where(eq(bagPreferenceColorsTable.preferenceId, pref.id)),
    db
      .select({ s: sizesTable })
      .from(bagPreferenceSizesTable)
      .innerJoin(sizesTable, eq(bagPreferenceSizesTable.sizeId, sizesTable.id))
      .where(eq(bagPreferenceSizesTable.preferenceId, pref.id)),
    pref.conditionMinId
      ? db.select().from(conditionsTable).where(eq(conditionsTable.id, pref.conditionMinId))
      : Promise.resolve([]),
  ]);

  const criteria: PreferenceCriteria = {
    nickname: pref.nickname,
    onlyExactCriteria: pref.onlyExactCriteria,
    exactModelEnabled: pref.exactModelEnabled,
    allowCloseMatches: pref.allowCloseMatches,
    allowCloseColorMatch: pref.allowCloseColorMatch,
    modelQuery: pref.modelQuery,
    minPrice: pref.minPrice ? parseFloat(pref.minPrice) : null,
    maxPrice: pref.maxPrice ? parseFloat(pref.maxPrice) : null,
    conditionMinRank: condMin[0]?.rank ?? null,
    conditionMinName: condMin[0]?.name ?? null,
    brands: brands.map((b) => b.b.normalizedName),
    styles: styles.map((s) => s.s.normalizedName),
    colors: colors.map((c) => c.c.normalizedName),
    sizes: sizes.map((s) => s.s.normalizedName),
    colorFamilies: Array.from(
      new Set(colors.map((c) => c.c.family).filter((f): f is string => Boolean(f))),
    ),
  };

  const colorFamily = listing.normalizedColor
    ? (
        await db
          .select({ family: colorsTable.family })
          .from(colorsTable)
          .where(eq(colorsTable.normalizedName, listing.normalizedColor))
      )[0]?.family ?? null
    : null;

  const facts: ListingFacts = {
    brand: listing.brand,
    model: listing.model,
    style: listing.style,
    condition: listing.condition,
    color: listing.color,
    size: listing.size,
    title: listing.title,
    price: parseFloat(listing.price),
    currency: listing.currency,
    normalizedBrand: listing.normalizedBrand,
    normalizedModel: listing.normalizedModel,
    normalizedStyle: listing.normalizedStyle,
    normalizedCondition: listing.normalizedCondition,
    normalizedColor: listing.normalizedColor,
    normalizedSize: listing.size ? normalizeText(listing.size) : null,
    conditionRank: listing.condition ? conditionRank(listing.condition) : null,
    colorFamily,
  };

  const result = evaluateMatch(criteria, facts);

  res.json({
    matchScore: result.matchScore,
    matchType: result.matchType,
    alertEligible: result.alertEligible,
    explanation: result.explanation,
    matchReasons: result.matchReasons,
    disqualifiers: result.disqualifiers,
    preference: {
      id: pref.id,
      userId: pref.userId,
      nickname: criteria.nickname,
      modelQuery: criteria.modelQuery,
      minPrice: criteria.minPrice,
      maxPrice: criteria.maxPrice,
      conditionMinName: criteria.conditionMinName,
      conditionMinRank: criteria.conditionMinRank,
      onlyExactCriteria: criteria.onlyExactCriteria,
      exactModelEnabled: criteria.exactModelEnabled,
      allowCloseMatches: criteria.allowCloseMatches,
      allowCloseColorMatch: criteria.allowCloseColorMatch,
      brands: criteria.brands,
      styles: criteria.styles,
      colors: criteria.colors,
      sizes: criteria.sizes,
      colorFamilies: criteria.colorFamilies,
    },
    listing: {
      id: listing.id,
      title: facts.title,
      brand: facts.brand,
      model: facts.model,
      style: facts.style,
      condition: facts.condition,
      color: facts.color,
      size: facts.size,
      price: facts.price,
      currency: facts.currency,
      normalizedBrand: facts.normalizedBrand,
      normalizedModel: facts.normalizedModel,
      normalizedStyle: facts.normalizedStyle,
      normalizedCondition: facts.normalizedCondition,
      normalizedColor: facts.normalizedColor,
      normalizedSize: facts.normalizedSize,
      conditionRank: facts.conditionRank,
      colorFamily: facts.colorFamily,
    },
  });
});

// ─── Taxonomy Manager ───────────────────────────────────────────────────────
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}
function isFkViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23503"
  );
}

// Brands
router.get("/taxonomy/brands", async (_req, res) => {
  const rows = await db.select().from(brandsTable).orderBy(asc(brandsTable.name));
  res.json(rows);
});
router.post("/taxonomy/brands", adminWriteRateLimiter, async (req, res) => {
  const parsed = CreateTaxonomyBrandBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const name = parsed.data.name.trim();
  const slug = (parsed.data.slug ?? slugify(name)).trim();
  try {
    const [row] = await db
      .insert(brandsTable)
      .values({ name, slug, normalizedName: normalizeText(name) })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Brand with that name or slug already exists" });
      return;
    }
    throw err;
  }
});
router.delete("/taxonomy/brands/:id", adminWriteRateLimiter, async (req, res) => {
  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const result = await db.delete(brandsTable).where(eq(brandsTable.id, parsed.data.id)).returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Brand not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    if (isFkViolation(err)) {
      res.status(409).json({ error: "Brand is still referenced by other rows" });
      return;
    }
    throw err;
  }
});

// Colors
router.get("/taxonomy/colors", async (_req, res) => {
  const rows = await db.select().from(colorsTable).orderBy(asc(colorsTable.name));
  res.json(rows);
});
router.post("/taxonomy/colors", adminWriteRateLimiter, async (req, res) => {
  const parsed = CreateTaxonomyColorBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const name = parsed.data.name.trim();
  const slug = (parsed.data.slug ?? slugify(name)).trim();
  try {
    const [row] = await db
      .insert(colorsTable)
      .values({
        name,
        slug,
        normalizedName: normalizeText(name),
        family: parsed.data.family.trim(),
        hex: parsed.data.hex ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Color with that name or slug already exists" });
      return;
    }
    throw err;
  }
});
router.delete("/taxonomy/colors/:id", adminWriteRateLimiter, async (req, res) => {
  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const result = await db.delete(colorsTable).where(eq(colorsTable.id, parsed.data.id)).returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Color not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    if (isFkViolation(err)) {
      res.status(409).json({ error: "Color is still referenced by other rows" });
      return;
    }
    throw err;
  }
});

// Conditions
router.get("/taxonomy/conditions", async (_req, res) => {
  const rows = await db.select().from(conditionsTable).orderBy(asc(conditionsTable.rank));
  res.json(rows);
});
router.post("/taxonomy/conditions", adminWriteRateLimiter, async (req, res) => {
  const parsed = CreateTaxonomyConditionBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const name = parsed.data.name.trim();
  const slug = (parsed.data.slug ?? slugify(name)).trim();
  try {
    const [row] = await db
      .insert(conditionsTable)
      .values({
        name,
        slug,
        normalizedName: normalizeText(name),
        rank: parsed.data.rank,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Condition with that name or slug already exists" });
      return;
    }
    throw err;
  }
});
router.delete("/taxonomy/conditions/:id", adminWriteRateLimiter, async (req, res) => {
  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const result = await db.delete(conditionsTable).where(eq(conditionsTable.id, parsed.data.id)).returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Condition not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    if (isFkViolation(err)) {
      res.status(409).json({ error: "Condition is still referenced by other rows" });
      return;
    }
    throw err;
  }
});

// Sizes
router.get("/taxonomy/sizes", async (_req, res) => {
  const rows = await db.select().from(sizesTable).orderBy(asc(sizesTable.name));
  res.json(rows);
});
router.post("/taxonomy/sizes", adminWriteRateLimiter, async (req, res) => {
  const parsed = CreateTaxonomySizeBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const name = parsed.data.name.trim();
  const slug = (parsed.data.slug ?? slugify(name)).trim();
  try {
    const [row] = await db
      .insert(sizesTable)
      .values({ name, slug, normalizedName: normalizeText(name) })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Size with that name or slug already exists" });
      return;
    }
    throw err;
  }
});
router.delete("/taxonomy/sizes/:id", adminWriteRateLimiter, async (req, res) => {
  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const result = await db.delete(sizesTable).where(eq(sizesTable.id, parsed.data.id)).returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Size not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    if (isFkViolation(err)) {
      res.status(409).json({ error: "Size is still referenced by other rows" });
      return;
    }
    throw err;
  }
});

// Styles
router.get("/taxonomy/styles", async (_req, res) => {
  const rows = await db.select().from(bagStylesTable).orderBy(asc(bagStylesTable.name));
  res.json(rows);
});
router.post("/taxonomy/styles", adminWriteRateLimiter, async (req, res) => {
  const parsed = CreateTaxonomyStyleBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const name = parsed.data.name.trim();
  const slug = (parsed.data.slug ?? slugify(name)).trim();
  try {
    const [row] = await db
      .insert(bagStylesTable)
      .values({ name, slug, normalizedName: normalizeText(name) })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Style with that name or slug already exists" });
      return;
    }
    throw err;
  }
});
router.delete("/taxonomy/styles/:id", adminWriteRateLimiter, async (req, res) => {
  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const result = await db.delete(bagStylesTable).where(eq(bagStylesTable.id, parsed.data.id)).returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Style not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    if (isFkViolation(err)) {
      res.status(409).json({ error: "Style is still referenced by other rows" });
      return;
    }
    throw err;
  }
});

// Models (brand-scoped)
const ListModelsQuery = z.object({
  brandId: z.coerce.number().int().positive().optional(),
}).strict();

router.get("/taxonomy/models", async (req, res) => {
  const parsedQuery = ListModelsQuery.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Invalid query", details: parsedQuery.error.issues });
    return;
  }
  const brandId = parsedQuery.data.brandId ?? null;
  const rows = await db
    .select({
      id: bagModelsTable.id,
      brandId: bagModelsTable.brandId,
      brandName: brandsTable.name,
      name: bagModelsTable.name,
      normalizedName: bagModelsTable.normalizedName,
    })
    .from(bagModelsTable)
    .innerJoin(brandsTable, eq(bagModelsTable.brandId, brandsTable.id))
    .where(brandId != null ? eq(bagModelsTable.brandId, brandId) : undefined)
    .orderBy(asc(brandsTable.name), asc(bagModelsTable.name));
  res.json(rows);
});
router.post("/taxonomy/models", adminWriteRateLimiter, async (req, res) => {
  const parsed = CreateTaxonomyModelBodyStrict.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const name = parsed.data.name.trim();
  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, parsed.data.brandId));
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  try {
    const [row] = await db
      .insert(bagModelsTable)
      .values({
        brandId: brand.id,
        name,
        normalizedName: normalizeText(name),
      })
      .returning();
    res.status(201).json({
      id: row.id,
      brandId: row.brandId,
      brandName: brand.name,
      name: row.name,
      normalizedName: row.normalizedName,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Model already exists for this brand" });
      return;
    }
    throw err;
  }
});
router.delete("/taxonomy/models/:id", adminWriteRateLimiter, async (req, res) => {
  const parsed = IdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db.delete(bagModelsTable).where(eq(bagModelsTable.id, parsed.data.id)).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  res.status(204).end();
});

export default router;
