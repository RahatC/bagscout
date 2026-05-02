import { Router } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  bagPreferencesTable,
  bagPreferenceBrandsTable,
  bagPreferenceStylesTable,
  bagPreferenceColorsTable,
  bagPreferenceSizesTable,
  brandsTable,
  bagStylesTable,
  colorsTable,
  sizesTable,
  conditionsTable,
  matchResultsTable,
  listingsTable,
} from "@workspace/db";
import {
  CreateBagPreferenceBody,
  UpdateBagPreferenceBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router = Router();

type AuthRequest = Request & { userId: string };

async function expandPreference(prefId: number) {
  const [pref] = await db
    .select()
    .from(bagPreferencesTable)
    .where(eq(bagPreferencesTable.id, prefId));
  if (!pref) return null;

  const [brands, styles, colors, sizes, conditionMin, matchCountRow] =
    await Promise.all([
      db
        .select({ b: brandsTable })
        .from(bagPreferenceBrandsTable)
        .innerJoin(brandsTable, eq(bagPreferenceBrandsTable.brandId, brandsTable.id))
        .where(eq(bagPreferenceBrandsTable.preferenceId, prefId)),
      db
        .select({ s: bagStylesTable })
        .from(bagPreferenceStylesTable)
        .innerJoin(bagStylesTable, eq(bagPreferenceStylesTable.styleId, bagStylesTable.id))
        .where(eq(bagPreferenceStylesTable.preferenceId, prefId)),
      db
        .select({ c: colorsTable })
        .from(bagPreferenceColorsTable)
        .innerJoin(colorsTable, eq(bagPreferenceColorsTable.colorId, colorsTable.id))
        .where(eq(bagPreferenceColorsTable.preferenceId, prefId)),
      db
        .select({ s: sizesTable })
        .from(bagPreferenceSizesTable)
        .innerJoin(sizesTable, eq(bagPreferenceSizesTable.sizeId, sizesTable.id))
        .where(eq(bagPreferenceSizesTable.preferenceId, prefId)),
      pref.conditionMinId
        ? db.select().from(conditionsTable).where(eq(conditionsTable.id, pref.conditionMinId))
        : Promise.resolve([]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(matchResultsTable)
        .where(eq(matchResultsTable.preferenceId, prefId)),
    ]);

  return {
    id: pref.id,
    userId: pref.userId,
    nickname: pref.nickname,
    exactModelEnabled: pref.exactModelEnabled,
    modelQuery: pref.modelQuery,
    conditionMin: conditionMin[0] ?? null,
    allowCloseColorMatch: pref.allowCloseColorMatch,
    minPrice: pref.minPrice ? parseFloat(pref.minPrice) : null,
    maxPrice: pref.maxPrice ? parseFloat(pref.maxPrice) : null,
    onlyExactCriteria: pref.onlyExactCriteria,
    allowCloseMatches: pref.allowCloseMatches,
    active: pref.active,
    alertFrequency: pref.alertFrequency as "realtime" | "daily" | "weekly",
    brands: brands.map((r) => r.b),
    styles: styles.map((r) => r.s),
    colors: colors.map((r) => r.c),
    sizes: sizes.map((r) => r.s),
    matchCount: matchCountRow[0]?.count ?? 0,
    createdAt: pref.createdAt,
    updatedAt: pref.updatedAt,
  };
}

async function setJunctions(prefId: number, body: {
  brandIds?: number[];
  styleIds?: number[];
  colorIds?: number[];
  sizeIds?: number[];
}) {
  if (body.brandIds !== undefined) {
    await db.delete(bagPreferenceBrandsTable).where(eq(bagPreferenceBrandsTable.preferenceId, prefId));
    if (body.brandIds.length > 0) {
      await db.insert(bagPreferenceBrandsTable).values(
        body.brandIds.map((brandId) => ({ preferenceId: prefId, brandId })),
      );
    }
  }
  if (body.styleIds !== undefined) {
    await db.delete(bagPreferenceStylesTable).where(eq(bagPreferenceStylesTable.preferenceId, prefId));
    if (body.styleIds.length > 0) {
      await db.insert(bagPreferenceStylesTable).values(
        body.styleIds.map((styleId) => ({ preferenceId: prefId, styleId })),
      );
    }
  }
  if (body.colorIds !== undefined) {
    await db.delete(bagPreferenceColorsTable).where(eq(bagPreferenceColorsTable.preferenceId, prefId));
    if (body.colorIds.length > 0) {
      await db.insert(bagPreferenceColorsTable).values(
        body.colorIds.map((colorId) => ({ preferenceId: prefId, colorId })),
      );
    }
  }
  if (body.sizeIds !== undefined) {
    await db.delete(bagPreferenceSizesTable).where(eq(bagPreferenceSizesTable.preferenceId, prefId));
    if (body.sizeIds.length > 0) {
      await db.insert(bagPreferenceSizesTable).values(
        body.sizeIds.map((sizeId) => ({ preferenceId: prefId, sizeId })),
      );
    }
  }
}

// GET /api/preferences
router.get("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const prefs = await db
    .select({ id: bagPreferencesTable.id })
    .from(bagPreferencesTable)
    .where(eq(bagPreferencesTable.userId, userId))
    .orderBy(bagPreferencesTable.createdAt);

  const expanded = await Promise.all(prefs.map((p) => expandPreference(p.id)));
  res.json(expanded.filter(Boolean));
});

// POST /api/preferences
router.post("/", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = CreateBagPreferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const data = parsed.data;
  const [pref] = await db
    .insert(bagPreferencesTable)
    .values({
      userId,
      nickname: data.nickname,
      exactModelEnabled: data.exactModelEnabled ?? false,
      modelQuery: data.modelQuery ?? null,
      conditionMinId: data.conditionMinId ?? null,
      allowCloseColorMatch: data.allowCloseColorMatch ?? true,
      minPrice: data.minPrice != null ? String(data.minPrice) : null,
      maxPrice: data.maxPrice != null ? String(data.maxPrice) : null,
      onlyExactCriteria: data.onlyExactCriteria ?? false,
      allowCloseMatches: data.allowCloseMatches ?? true,
      active: data.active ?? true,
      alertFrequency: data.alertFrequency ?? "realtime",
    })
    .returning();

  await setJunctions(pref.id, {
    brandIds: data.brandIds,
    styleIds: data.styleIds,
    colorIds: data.colorIds,
    sizeIds: data.sizeIds,
  });

  const result = await expandPreference(pref.id);
  res.status(201).json(result);
});

// GET /api/preferences/:id
router.get("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [pref] = await db
    .select()
    .from(bagPreferencesTable)
    .where(and(eq(bagPreferencesTable.id, id), eq(bagPreferencesTable.userId, userId)));
  if (!pref) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await expandPreference(id);
  res.json(result);
});

// PATCH /api/preferences/:id
router.patch("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateBagPreferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const data = parsed.data;

  const [existing] = await db
    .select()
    .from(bagPreferencesTable)
    .where(and(eq(bagPreferencesTable.id, id), eq(bagPreferencesTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (data.nickname !== undefined) updates.nickname = data.nickname;
  if (data.exactModelEnabled !== undefined) updates.exactModelEnabled = data.exactModelEnabled;
  if (data.modelQuery !== undefined) updates.modelQuery = data.modelQuery;
  if (data.conditionMinId !== undefined) updates.conditionMinId = data.conditionMinId;
  if (data.allowCloseColorMatch !== undefined)
    updates.allowCloseColorMatch = data.allowCloseColorMatch;
  if (data.minPrice !== undefined)
    updates.minPrice = data.minPrice != null ? String(data.minPrice) : null;
  if (data.maxPrice !== undefined)
    updates.maxPrice = data.maxPrice != null ? String(data.maxPrice) : null;
  if (data.onlyExactCriteria !== undefined) updates.onlyExactCriteria = data.onlyExactCriteria;
  if (data.allowCloseMatches !== undefined) updates.allowCloseMatches = data.allowCloseMatches;
  if (data.active !== undefined) updates.active = data.active;
  if (data.alertFrequency !== undefined) updates.alertFrequency = data.alertFrequency;

  if (Object.keys(updates).length > 0) {
    await db.update(bagPreferencesTable).set(updates).where(eq(bagPreferencesTable.id, id));
  }

  await setJunctions(id, {
    brandIds: data.brandIds,
    styleIds: data.styleIds,
    colorIds: data.colorIds,
    sizeIds: data.sizeIds,
  });

  const result = await expandPreference(id);
  res.json(result);
});

// GET /api/preferences/:id/suggestions
// Heuristic widening suggestions: only emitted when the watchlist is narrow
// AND has few/no matches. Friendly, scoped, never spammy.
router.get("/:id/suggestions", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [pref] = await db
    .select()
    .from(bagPreferencesTable)
    .where(and(eq(bagPreferencesTable.id, id), eq(bagPreferencesTable.userId, userId)));
  if (!pref) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const expanded = await expandPreference(id);
  if (!expanded) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const suggestions: Array<{
    type:
      | "add_close_colors"
      | "add_adjacent_sizes"
      | "raise_max_price"
      | "include_adjacent_models";
    title: string;
    body: string;
    suggestedMaxPrice?: number | null;
    suggestedColorIds?: number[] | null;
    suggestedSizeIds?: number[] | null;
  }> = [];

  // Suggestion 1: close colors. If user has explicit color filters but the
  // "allowCloseColorMatch" toggle is off, suggest enabling it (no payload —
  // the user toggles it via edit).
  if (expanded.colors.length > 0 && !expanded.allowCloseColorMatch) {
    suggestions.push({
      type: "add_close_colors",
      title: "Allow close color matches",
      body: `You picked ${expanded.colors.length} ${
        expanded.colors.length === 1 ? "color" : "colors"
      } but require an exact match. Enabling close colors widens the net to nearby shades in the same family.`,
    });
  }

  // Suggestion 2: adjacent sizes. If the user has exactly one size selected,
  // surface up to two other sizes that frequently appear in listings of the
  // same brands — these are the most likely "close enough" alternatives.
  if (expanded.sizes.length === 1 && expanded.brands.length > 0) {
    const onlySize = expanded.sizes[0];
    const brandSlugs = expanded.brands.map((b) => b.normalizedName);
    const popularSizes = await db
      .select({
        size: sizesTable,
        n: sql<number>`count(*)::int`,
      })
      .from(listingsTable)
      .innerJoin(
        sizesTable,
        sql`lower(${listingsTable.size}) = lower(${sizesTable.name})`,
      )
      .where(
        and(
          inArray(listingsTable.normalizedBrand, brandSlugs),
          eq(listingsTable.availabilityStatus, "available"),
          sql`${sizesTable.id} != ${onlySize.id}`,
        ),
      )
      .groupBy(sizesTable.id)
      .orderBy(sql`count(*) desc`)
      .limit(2);
    if (popularSizes.length > 0) {
      suggestions.push({
        type: "add_adjacent_sizes",
        title: `Include adjacent sizes`,
        body: `You only watch "${onlySize.name}". Adding ${popularSizes
          .map((n) => `"${n.size.name}"`)
          .join(", ")} can surface listings that are close enough to consider.`,
        suggestedSizeIds: popularSizes.map((n) => n.size.id),
      });
    }
  }

  // Suggestion 3: raise max price. If a max price exists AND the median of
  // available listings matching brand+style is meaningfully above the cap,
  // suggest a new cap that pulls in roughly half the market.
  if (expanded.maxPrice != null && expanded.brands.length > 0) {
    const brandIds = expanded.brands.map((b) => b.id);
    const brandSlugs = expanded.brands.map((b) => b.normalizedName);
    const [stats] = await db
      .select({
        median: sql<string | null>`percentile_cont(0.5) within group (order by ${listingsTable.price}::numeric)`,
        count: sql<number>`count(*)::int`,
      })
      .from(listingsTable)
      .where(
        and(
          eq(listingsTable.availabilityStatus, "available"),
          inArray(listingsTable.normalizedBrand, brandSlugs.length > 0 ? brandSlugs : ["__none__"]),
        ),
      );
    void brandIds;
    const median = stats?.median ? parseFloat(stats.median) : null;
    if (median != null && stats.count >= 5 && median > expanded.maxPrice * 1.1) {
      const suggested = Math.ceil(median / 50) * 50;
      suggestions.push({
        type: "raise_max_price",
        title: `Raise your max to about $${suggested.toLocaleString()}`,
        body: `The median price for these brands is currently $${median.toFixed(
          0,
        )}. Your cap of $${expanded.maxPrice.toFixed(
          0,
        )} excludes more than half of available listings. Raising it widens your alerts considerably.`,
        suggestedMaxPrice: suggested,
      });
    }
  }

  // Suggestion 4: include adjacent models. If exactModelEnabled and modelQuery
  // is set, hint that turning off exact-model match opens up sister models.
  if (expanded.exactModelEnabled && expanded.modelQuery) {
    suggestions.push({
      type: "include_adjacent_models",
      title: "Open up to similar models",
      body: `You've locked alerts to "${expanded.modelQuery}". Turning off "exact model only" lets adjacent or related models in the same family come through.`,
    });
  }

  res.json({ preferenceId: id, suggestions });
});

// DELETE /api/preferences/:id
router.delete("/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(bagPreferencesTable)
    .where(and(eq(bagPreferencesTable.id, id), eq(bagPreferencesTable.userId, userId)));
  res.status(204).end();
});

export default router;
