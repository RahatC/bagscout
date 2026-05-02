import * as Sentry from "@sentry/react";

let initialized = false;

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-clerk-auth-token",
  "x-clerk-auth",
]);

function scrubHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) ? "[Filtered]" : v;
  }
  return out;
}

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    tracesSampleRate: Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0",
    ),
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend(event) {
      if (event.request?.headers) {
        event.request.headers = scrubHeaders(
          event.request.headers as Record<string, string>,
        );
      }
      if (event.request?.cookies) {
        event.request.cookies = "[Filtered]" as unknown as Record<
          string,
          string
        >;
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
        if (breadcrumb.data) {
          delete breadcrumb.data.request_body_size;
          if (typeof breadcrumb.data.url === "string") {
            // strip query strings to avoid leaking tokens
            breadcrumb.data.url = breadcrumb.data.url.split("?")[0];
          }
        }
      }
      return breadcrumb;
    },
  });

  initialized = true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export { Sentry };
