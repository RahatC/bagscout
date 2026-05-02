import { logger } from "../lib/logger";

const DEFAULT_USER_AGENT =
  "BagScoutBot/1.0 (+https://bagscout.app/bot; ingestion crawler)";

const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type FetchKind = "html" | "json";

export interface FetchOptions {
  /** Per-request override for the request timeout in ms. */
  timeoutMs?: number;
  /** Override total retry attempts (default 3). */
  retries?: number;
  /** Initial backoff delay in ms (default 500). Doubles per attempt. */
  backoffMs?: number;
  /** Treat 404 as a non-retryable, returnable null instead of throwing. */
  allow404?: boolean;
  /** Pose as a real browser. Required for many resale-marketplace CDNs. */
  asBrowser?: boolean;
  /** Extra headers (merged on top of defaults). */
  headers?: Record<string, string>;
  /** Logger context (typically `{ source: "fashionphile" }`). */
  context?: Record<string, unknown>;
}

export class HttpFetchError extends Error {
  status: number | null;
  url: string;
  attempts: number;
  constructor(opts: { url: string; status: number | null; attempts: number; cause?: unknown; message: string }) {
    super(opts.message);
    this.name = "HttpFetchError";
    this.status = opts.status;
    this.url = opts.url;
    this.attempts = opts.attempts;
    if (opts.cause) (this as unknown as { cause: unknown }).cause = opts.cause;
  }
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Status codes worth retrying. Everything else is fatal (or 404 returns null
 * if `allow404` is set).
 */
function isRetryable(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

/**
 * Robust HTTP fetch with timeout, retry, and exponential backoff.
 *
 * Returns the response body. Throws `HttpFetchError` after retries are
 * exhausted. Designed for ingestion crawlers — never silently returns the
 * wrong shape, never bypasses anti-bot measures, just identifies as a bot
 * (or as a browser when servers reject default UA strings) and respects
 * server-side throttling.
 */
export async function httpFetch<T = string>(
  url: string,
  kind: FetchKind,
  opts: FetchOptions = {},
): Promise<T | null> {
  const {
    timeoutMs = 15_000,
    retries = 3,
    backoffMs = 500,
    allow404 = false,
    asBrowser = false,
    headers: extraHeaders = {},
    context = {},
  } = opts;

  const baseHeaders: Record<string, string> = {
    "User-Agent": asBrowser ? BROWSER_USER_AGENT : DEFAULT_USER_AGENT,
    Accept: kind === "json" ? "application/json,*/*;q=0.9" : DEFAULT_ACCEPT,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    ...extraHeaders,
  };

  let lastErr: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: baseHeaders,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeoutHandle);

      lastStatus = res.status;

      if (res.status === 404 && allow404) {
        logger.debug({ ...context, url, status: 404 }, "httpFetch: 404 (allowed)");
        return null;
      }

      if (!res.ok) {
        if (isRetryable(res.status) && attempt < retries) {
          const wait = backoffMs * 2 ** (attempt - 1);
          logger.warn(
            { ...context, url, status: res.status, attempt, retryInMs: wait },
            "httpFetch: retryable status, will retry",
          );
          await sleep(wait);
          continue;
        }
        // Non-retryable status (or last attempt). Throw outside the
        // generic catch's retry path by surfacing the error directly.
        const httpErr = new HttpFetchError({
          url,
          status: res.status,
          attempts: attempt,
          message: `HTTP ${res.status} for ${url}`,
        });
        throw httpErr;
      }

      // Read body in the requested format.
      const body = kind === "json" ? await res.json() : await res.text();
      const elapsed = Date.now() - startedAt;
      logger.debug({ ...context, url, status: res.status, ms: elapsed }, "httpFetch: ok");
      return body as T;
    } catch (err) {
      clearTimeout(timeoutHandle);
      lastErr = err;
      // A non-retryable HttpFetchError thrown above must escape immediately.
      if (err instanceof HttpFetchError && err.status !== null && !isRetryable(err.status)) {
        throw err;
      }
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (attempt < retries) {
        const wait = backoffMs * 2 ** (attempt - 1);
        logger.warn(
          {
            ...context,
            url,
            attempt,
            retryInMs: wait,
            err: err instanceof Error ? err.message : String(err),
            timeout: isAbort,
          },
          "httpFetch: error, will retry",
        );
        await sleep(wait);
        continue;
      }
      if (err instanceof HttpFetchError) throw err;
      throw new HttpFetchError({
        url,
        status: lastStatus,
        attempts: attempt,
        cause: err,
        message: `Fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Unreachable but the compiler doesn't know.
  throw new HttpFetchError({
    url,
    status: lastStatus,
    attempts: retries,
    cause: lastErr,
    message: `Fetch failed for ${url} after ${retries} attempts`,
  });
}

/**
 * Token-bucket-ish per-source rate limiter. Each source instance holds its
 * own limiter so one slow site can't starve another. Deliberately simple —
 * we only need to space out requests, not allow bursts.
 */
export class RateLimiter {
  private nextAvailableAt = 0;
  constructor(private readonly minIntervalMs: number) {}

  /**
   * Resolves once the limiter allows another request. Awaitable serialiser:
   * even with parallel callers, requests are spaced at least
   * `minIntervalMs` apart.
   */
  async acquire(): Promise<void> {
    const now = Date.now();
    if (now >= this.nextAvailableAt) {
      this.nextAvailableAt = now + this.minIntervalMs;
      return;
    }
    const wait = this.nextAvailableAt - now;
    this.nextAvailableAt += this.minIntervalMs;
    await sleep(wait);
  }
}
