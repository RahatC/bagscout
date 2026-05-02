import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referenceRouter from "./reference";
import preferencesRouter from "./preferences";
import listingsRouter from "./listings";
import matchesRouter, { preferenceMatchesHandler } from "./matches";
import alertsRouter from "./alerts";
import savedRouter from "./saved";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/reference", referenceRouter);
router.use("/preferences", preferenceMatchesHandler); // /preferences/:id/matches
router.use("/preferences", preferencesRouter);
router.use("/listings", listingsRouter);
router.use("/matches", matchesRouter);
router.use("/alerts", alertsRouter);
router.use("/saved", savedRouter);
router.use("/dashboard", dashboardRouter);
router.use("/admin", adminRouter);

export default router;
