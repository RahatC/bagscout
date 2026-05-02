import * as Sentry from "@sentry/node";
import { logger } from "./logger";

let initialized = false;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-clerk-auth-token",
  "x-clerk-auth",
  "clerk-session",
]);

const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "secret",
  "authorization",
  "clerkSession",
  "html",
  "body",
  "emailBody",
]);

function scrubObject(value: unknown, depth = 0): unknown {
  if (depth > 5 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubObject(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_BODY_KEYS.has(key)) {
        out[key] = "[Filtered]";
      } else {
        out[key] = scrubObject(raw, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        for (const key of Object.keys(headers)) {
          if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
            headers[key] = "[Filtered]";
          }
        }
      }
      if (event.request?.cookies) {
        event.request.cookies = "[Filtered]" as unknown as Record<
          string,
          string
        >;
      }
      if (event.request?.data) {
        event.request.data = scrubObject(event.request.data);
      }
      if (event.extra) {
        event.extra = scrubObject(event.extra) as Record<string, unknown>;
      }
      return event;
    },
  });

  initialized = true;
  logger.info("Sentry initialized");
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export { Sentry };
