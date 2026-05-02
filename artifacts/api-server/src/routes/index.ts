import { Router, type IRouter } from "express";
import healthRouter from "./health";
import watchlistsRouter from "./watchlists";
import listingsRouter from "./listings";
import matchesRouter from "./matches";
import alertsRouter from "./alerts";
import savedRouter from "./saved";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/watchlists", watchlistsRouter);
router.use("/listings", listingsRouter);
router.use("/matches", matchesRouter);
router.use("/alerts", alertsRouter);
router.use("/saved", savedRouter);
router.use("/dashboard", dashboardRouter);
router.use("/admin", adminRouter);

export default router;
