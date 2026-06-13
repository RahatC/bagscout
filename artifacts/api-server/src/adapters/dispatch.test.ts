import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAdapter, getAdapterForSource } from "./index";

/**
 * Compliance gate: production must be mock-only by default. Live ingestion of
 * a source requires BOTH the source's DB mode = 'live' AND an explicit
 * INGEST_USE_MOCK_ADAPTERS=false opt-in. These tests pin that contract so a
 * future change can't silently re-enable third-party HTTP scraping on a
 * freshly-migrated database.
 */
describe("getAdapterForSource compliance gate", () => {
  const KEY = "INGEST_USE_MOCK_ADAPTERS";
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[KEY];
    delete process.env[KEY];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("returns the MOCK adapter for a live source when the env is unset (default)", () => {
    const a = getAdapterForSource("fashionphile", "live");
    expect(a).toBe(getAdapterForSource("fashionphile", "mock"));
  });

  it("returns the MOCK adapter for a live source when mock is forced", () => {
    process.env[KEY] = "true";
    const a = getAdapterForSource("rebag", "live");
    expect(a).toBe(getAdapterForSource("rebag", "mock"));
  });

  it("returns a DIFFERENT (live) adapter only when explicitly opted in", () => {
    process.env[KEY] = "false";
    const live = getAdapterForSource("fashionphile", "live");
    process.env[KEY] = "true";
    const mock = getAdapterForSource("fashionphile", "live");
    expect(live).not.toBe(mock);
  });

  it("never returns live for a source whose DB mode is 'mock', even when opted in", () => {
    process.env[KEY] = "false";
    const a = getAdapterForSource("fashionphile", "mock");
    process.env[KEY] = "true";
    const mock = getAdapterForSource("fashionphile", "mock");
    expect(a).toBe(mock);
  });

  it("getAdapter (legacy) honors the mock-only default too", () => {
    const def = getAdapter("fashionphile");
    process.env[KEY] = "true";
    expect(def).toBe(getAdapter("fashionphile"));
  });

  it("returns undefined for an unknown slug", () => {
    expect(getAdapterForSource("nope", "live")).toBeUndefined();
    expect(getAdapter("nope")).toBeUndefined();
  });
});
