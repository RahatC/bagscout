import express, { type Express } from "express";
import preferencesRouter from "../routes/preferences";

/**
 * Build a tiny express app with just the preferences router mounted.
 * Caller is expected to have vi.mock()-ed `../middlewares/requireAuth`
 * before importing this module so the router uses the fake auth.
 */
export function buildPreferencesApp(): Express {
  const app: Express = express();
  app.use(express.json());
  app.use("/api/preferences", preferencesRouter);
  // Generic error fallback so test failures show up as 500 with details.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    res.status(500).json({ error: err.message, stack: err.stack });
  });
  return app;
}
