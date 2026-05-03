import type { CorsOptions } from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { getAuth } from "@clerk/express";

/**
 * Build a CORS allowlist from env. In development we accept any origin so the
 * Vite dev server and Replit proxy domains work without extra config; in
 * production we require an explicit allowlist (no wildcards).
 *
 * Allowed sources, merged:
 *   - `CORS_ALLOWED_ORIGINS` — comma-separated absolute origins
 *   - `REPLIT_DOMAINS` — comma-separated hostnames (we add https:// to each)
 *   - hardcoded localhost dev origins (only in non-production)
 *
 * A request with no Origin header (server-to-server, curl) is always allowed.
 */
export function buildCorsOptions(): CorsOptions {
  const isProd = process.env.NODE_ENV === "production";
  const explicit = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const replitDomains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((host) => `https://${host}`);

  const devOrigins = isProd
    ? []
    : [
        "http://localhost:5173",
        "http://localhost:5000",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:80",
      ];

  const allowlist = new Set<string>([
    ...explicit,
    ...replitDomains,
    ...devOrigins,
  ]);

  // .replit.dev / .replit.app preview hostnames are dynamic; allow them in
  // any environment because Replit-issued domains are trusted upstream.
  const replitHostSuffixes = [".replit.dev", ".replit.app", ".repl.co"];

  return {
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowlist.has(origin)) return cb(null, true);
      try {
        const url = new URL(origin);
        if (replitHostSuffixes.some((s) => url.hostname.endsWith(s))) {
          return cb(null, true);
        }
      } catch {
        // fall through
      }
      if (!isProd) {
        // In dev, default-allow rather than block to avoid surprising the
        // local developer. Production is strict.
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
  };
}

/**
 * Resolve a stable per-client key for rate limiting. Prefers the Clerk user
 * id when authenticated (so a single user across multiple IPs shares one
 * bucket), otherwise falls back to the client IP. We use the helper
 * `ipKeyGenerator` so IPv6 addresses are normalised to a sensible /64.
 */
function clientKey(req: Request): string {
  const userId = getAuth(req)?.userId;
  if (userId) return `user:${userId}`;
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

/**
 * Per-IP limit for unauthenticated public endpoints (health, listings,
 * reference). Sized to comfortably support normal browsing while blocking
 * obvious scraping/abuse. Memory store is fine for a single-process
 * deployment; move to a Redis store before scaling horizontally.
 */
export const publicRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "")}`,
  message: { error: "Too many requests, please slow down." },
});

/**
 * More generous per-user limit for authenticated endpoints. Falls back to
 * IP for any request that slips through unauthenticated.
 */
export const authedRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { error: "Too many requests, please slow down." },
});

/**
 * Tighter limit for admin write endpoints — these kick off real work
 * (ingest cycles, digest sends) so we cap how often a single admin can
 * fire them.
 */
export const adminWriteRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { error: "Too many admin actions, please slow down." },
});
