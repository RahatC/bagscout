import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/deep", async (req, res) => {
  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    res.json({
      status: "ok",
      checks: { database: { status: "ok", latencyMs: Date.now() - start } },
    });
  } catch (err) {
    req.log?.error({ err }, "Deep health check: database unreachable");
    res.status(503).json({
      status: "error",
      checks: {
        database: {
          status: "error",
          error: err instanceof Error ? err.message : "unknown",
        },
      },
    });
  }
});

export default router;
