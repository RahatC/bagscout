import express, { type Express, type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import * as Sentry from "@sentry/node";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import {
  buildCorsOptions,
  publicRateLimiter,
  authedRateLimiter,
} from "./middlewares/security";
import router from "./routes";
import { logger } from "./lib/logger";
import { isSentryEnabled } from "./lib/sentry";

const app: Express = express();

// Trust the Replit proxy so req.ip reflects the real client. Without this,
// every request looks like it came from 127.0.0.1 and rate limits collapse
// onto a single bucket. Trust the first hop only; more would let clients
// spoof X-Forwarded-For.
app.set("trust proxy", 1);

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

// Security headers. CSP is intentionally not enabled here — the React app
// is served by a separate artifact and Clerk's auth flows load assets from
// its own domains, so a strict CSP set on the API would either be vacuous
// or break the auth UI. Helmet's other defaults (HSTS, X-Content-Type-
// Options, Referrer-Policy, etc.) are still useful.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

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

// Apply a generous baseline rate limit to every /api request. Individual
// routers (e.g. admin) layer stricter limits on top. The authenticated
// limiter keys per Clerk user once auth has resolved, so a single user
// across multiple IPs still shares one bucket.
app.use("/api", authedRateLimiter);

// Stricter per-IP limits for the highest-volume public endpoints. Listed
// explicitly rather than gated on auth state so unauthenticated scraping
// hits the tighter cap regardless of which key the per-user limiter chose.
app.use("/api/healthz", publicRateLimiter);
app.use("/api/listings", publicRateLimiter);
app.use("/api/reference", publicRateLimiter);

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
