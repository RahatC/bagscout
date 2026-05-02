import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import * as Sentry from "@sentry/node";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { isSentryEnabled } from "./lib/sentry";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use((req, _res, next) => {
  if (isSentryEnabled()) {
    // Use the per-request isolation scope created by Sentry's HTTP
    // integration so user context never leaks across concurrent requests.
    const isolationScope = Sentry.getIsolationScope();
    const userId = getAuth(req as Request)?.userId;
    if (userId) {
      isolationScope.setUser({ id: userId });
    } else {
      isolationScope.setUser(null);
    }
    isolationScope.setTag("route", req.path);
  }
  next();
});

app.use("/api", router);

if (isSentryEnabled()) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    req.log?.error({ err }, "Unhandled route error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal Server Error" });
  },
);

export default app;
