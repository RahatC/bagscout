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
