import { Router } from "express";
import {
  db,
  brandsTable,
  bagStylesTable,
  colorsTable,
  conditionsTable,
  sizesTable,
} from "@workspace/db";
import { asc } from "drizzle-orm";

const router = Router();

router.get("/brands", async (_req, res) => {
  const rows = await db.select().from(brandsTable).orderBy(asc(brandsTable.name));
  res.json(rows);
});

router.get("/styles", async (_req, res) => {
  const rows = await db.select().from(bagStylesTable).orderBy(asc(bagStylesTable.name));
  res.json(rows);
});

router.get("/colors", async (_req, res) => {
  const rows = await db.select().from(colorsTable).orderBy(asc(colorsTable.name));
  res.json(rows);
});

router.get("/conditions", async (_req, res) => {
  const rows = await db.select().from(conditionsTable).orderBy(asc(conditionsTable.rank));
  res.json(rows);
});

router.get("/sizes", async (_req, res) => {
  const rows = await db.select().from(sizesTable).orderBy(asc(sizesTable.name));
  res.json(rows);
});

export default router;
