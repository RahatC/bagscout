import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpFetch, HttpFetchError, RateLimiter } from "./http";

describe("httpFetch", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("returns parsed JSON on 200", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const promise = httpFetch<{ ok: boolean }>("https://example.test/api", "json");
    await vi.runAllTimersAsync();
    const body = await promise;
    expect(body).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns text body on 200 for html requests", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch;

    const promise = httpFetch<string>("https://example.test/page", "html");
    await vi.runAllTimersAsync();
    expect(await promise).toBe("<html>ok</html>");
  });

  it("returns null for 404 when allow404 is true", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("not found", { status: 404 }),
    ) as unknown as typeof fetch;

    const promise = httpFetch<string>("https://example.test/missing", "html", {
      allow404: true,
    });
    await vi.runAllTimersAsync();
    expect(await promise).toBeNull();
  });

  it("retries on 503 and eventually succeeds", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response("err", { status: 503 });
      return new Response("<html>recovered</html>", { status: 200 });
    }) as unknown as typeof fetch;

    const promise = httpFetch<string>("https://example.test/x", "html", {
      retries: 3,
      backoffMs: 10,
    });
    await vi.runAllTimersAsync();
    expect(await promise).toBe("<html>recovered</html>");
    expect(calls).toBe(2);
  });

  it("throws HttpFetchError after retries are exhausted on 5xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("err", { status: 503 }),
    ) as unknown as typeof fetch;

    const promise = httpFetch<string>("https://example.test/y", "html", {
      retries: 2,
      backoffMs: 1,
    });
    // Surface rejection so vitest doesn't warn about unhandled rejection
    // while we wait for the timers to flush.
    const settled = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await settled;
    expect(err).toBeInstanceOf(HttpFetchError);
    expect((err as HttpFetchError).status).toBe(503);
  });

  it("does not retry on 401 (non-retryable)", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response("nope", { status: 401 });
    }) as unknown as typeof fetch;

    const promise = httpFetch<string>("https://example.test/z", "html", {
      retries: 4,
      backoffMs: 1,
    });
    const settled = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await settled;
    expect(err).toBeInstanceOf(HttpFetchError);
    expect((err as HttpFetchError).status).toBe(401);
    expect(calls).toBe(1);
  });
});

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spaces out acquisitions by at least minIntervalMs", async () => {
    const limiter = new RateLimiter(100);
    const stamps: number[] = [];

    const start = Date.now();
    const tasks = [0, 1, 2].map(async () => {
      await limiter.acquire();
      stamps.push(Date.now() - start);
    });

    await vi.runAllTimersAsync();
    await Promise.all(tasks);

    expect(stamps).toHaveLength(3);
    expect(stamps[0]).toBeLessThan(50);
    expect(stamps[1]).toBeGreaterThanOrEqual(100);
    expect(stamps[2]).toBeGreaterThanOrEqual(200);
  });
});
