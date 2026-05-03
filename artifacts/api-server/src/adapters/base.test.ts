import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldUseMockAdapters } from "./base";

describe("shouldUseMockAdapters env parsing", () => {
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

  it("defaults to true when unset", () => {
    expect(shouldUseMockAdapters()).toBe(true);
  });

  it("treats empty / whitespace-only as mock", () => {
    process.env[KEY] = "";
    expect(shouldUseMockAdapters()).toBe(true);
    process.env[KEY] = "   ";
    expect(shouldUseMockAdapters()).toBe(true);
  });

  it("returns false only for explicit '0' or 'false' (case + whitespace tolerant)", () => {
    for (const v of ["0", "false", "FALSE", " false ", "False"]) {
      process.env[KEY] = v;
      expect(shouldUseMockAdapters()).toBe(false);
    }
  });

  it("returns true for explicit '1' / 'true' (case + whitespace tolerant)", () => {
    for (const v of ["1", "true", "TRUE", " True "]) {
      process.env[KEY] = v;
      expect(shouldUseMockAdapters()).toBe(true);
    }
  });

  it("returns true (safe default) for unrecognized values", () => {
    process.env[KEY] = "yes";
    expect(shouldUseMockAdapters()).toBe(true);
    process.env[KEY] = "no";
    expect(shouldUseMockAdapters()).toBe(true);
  });
});
