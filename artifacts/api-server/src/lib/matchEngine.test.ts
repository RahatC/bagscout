import { describe, it, expect } from "vitest";
import { evaluateMatch, type PreferenceCriteria, type ListingFacts } from "./matchEngine";

// ---------------------------------------------------------------------------
// Test fixtures — concise builders that produce a complete preference /
// listing with sensible defaults. Tests override only the fields they care
// about.
// ---------------------------------------------------------------------------
function buildPreference(overrides: Partial<PreferenceCriteria> = {}): PreferenceCriteria {
  return {
    nickname: "Dream Bag",
    onlyExactCriteria: false,
    exactModelEnabled: false,
    allowCloseMatches: true,
    allowCloseColorMatch: true,
    modelQuery: null,
    minPrice: null,
    maxPrice: null,
    conditionMinRank: null,
    conditionMinName: null,
    brands: ["chanel"],
    styles: ["shoulder bag"],
    colors: ["black"],
    sizes: [],
    colorFamilies: ["dark"],
    ...overrides,
  };
}

function buildListing(overrides: Partial<ListingFacts> = {}): ListingFacts {
  return {
    brand: "Chanel",
    model: "Classic Flap",
    style: "Shoulder Bag",
    condition: "Excellent",
    color: "Black",
    size: "Medium",
    title: "Chanel Classic Flap Medium Black Caviar",
    price: 4850,
    currency: "USD",
    normalizedBrand: "chanel",
    normalizedModel: "classic flap",
    normalizedStyle: "shoulder bag",
    normalizedCondition: "excellent",
    normalizedColor: "black",
    normalizedSize: "medium",
    conditionRank: 3,
    colorFamily: "dark",
    ...overrides,
  };
}

describe("matchEngine — exact and high-confidence matches", () => {
  it("1. Exact match — every field aligns and price is in range", () => {
    const pref = buildPreference({
      sizes: ["medium"],
      minPrice: 4000,
      maxPrice: 5000,
      conditionMinRank: 4,
      conditionMinName: "Very Good",
      exactModelEnabled: true,
      modelQuery: "classic flap",
    });
    const listing = buildListing();
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("exact");
    expect(out.matchScore).toBe(100);
    expect(out.disqualifiers).toHaveLength(0);
    expect(out.alertEligible).toBe(true);
    expect(out.explanation).toContain("Chanel Classic Flap");
    expect(out.explanation).toContain("$4,000–$5,000");
  });

  it("2. Strong match — minor mismatch on size only", () => {
    const pref = buildPreference({
      sizes: ["small"],
      minPrice: 4000,
      maxPrice: 5000,
      conditionMinRank: 4,
      conditionMinName: "Very Good",
    });
    const listing = buildListing({ size: "Medium", normalizedSize: "medium" });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("strong");
    expect(out.matchScore).toBeGreaterThanOrEqual(80);
    expect(out.matchScore).toBeLessThan(95);
    expect(out.disqualifiers.some((d) => d.field === "size")).toBe(true);
    expect(out.alertEligible).toBe(true);
  });

  it("3. Generates a deterministic explanation in plain English", () => {
    const pref = buildPreference({
      sizes: ["medium"],
      minPrice: 4000,
      maxPrice: 5000,
      conditionMinRank: 4,
      conditionMinName: "Very Good",
    });
    const listing = buildListing();
    const a = evaluateMatch(pref, listing);
    const b = evaluateMatch(pref, listing);

    expect(a).toEqual(b);
    expect(a.explanation).toMatch(/Chanel Classic Flap/);
    expect(a.explanation).toMatch(/black/i);
    expect(a.explanation).toMatch(/excellent condition/i);
    expect(a.explanation).toMatch(/\$4,850/);
    expect(a.explanation).toMatch(/within your \$4,000–\$5,000 range/);
  });
});

describe("matchEngine — hard rejections (gates)", () => {
  it("4. Wrong brand — rejected immediately, score 0, no alert", () => {
    const pref = buildPreference({ brands: ["chanel"] });
    const listing = buildListing({
      brand: "Hermès",
      normalizedBrand: "hermes",
      model: "Birkin",
      title: "Hermès Birkin 30 Black",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("rejected");
    expect(out.matchScore).toBe(0);
    expect(out.alertEligible).toBe(false);
    expect(out.disqualifiers[0]).toMatchObject({ field: "brand" });
    expect(out.explanation).toContain("did not match");
  });

  it("5. Price too high (no buffer mode) — rejected", () => {
    const pref = buildPreference({
      minPrice: 4000,
      maxPrice: 5000,
      allowCloseMatches: false,
    });
    const listing = buildListing({ price: 7800 });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("rejected");
    expect(out.alertEligible).toBe(false);
    expect(out.disqualifiers.some((d) => d.field === "price")).toBe(true);
  });

  it("6. Price too low — rejected", () => {
    const pref = buildPreference({
      minPrice: 4000,
      maxPrice: 5000,
      allowCloseMatches: false,
    });
    const listing = buildListing({ price: 1200 });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("rejected");
    expect(out.disqualifiers.some((d) => d.field === "price")).toBe(true);
  });

  it("7. Condition below minimum — rejected even outside strict mode", () => {
    const pref = buildPreference({
      conditionMinRank: 3, // Excellent or better
      conditionMinName: "Excellent",
    });
    const listing = buildListing({
      condition: "Fair",
      normalizedCondition: "fair",
      conditionRank: 6,
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("rejected");
    expect(out.alertEligible).toBe(false);
    expect(out.disqualifiers.some((d) => d.field === "condition")).toBe(true);
  });

  it("8. Condition exactly at minimum — accepted", () => {
    const pref = buildPreference({
      conditionMinRank: 3,
      conditionMinName: "Excellent",
    });
    const listing = buildListing({
      condition: "Excellent",
      normalizedCondition: "excellent",
      conditionRank: 3,
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).not.toBe("rejected");
    expect(out.alertEligible).toBe(true);
  });
});

describe("matchEngine — soft mismatches (still surface as close/weak)", () => {
  it("9. Right brand, wrong model — close match (no exact-model required)", () => {
    const pref = buildPreference();
    const listing = buildListing({
      model: "19 Bag",
      normalizedModel: "19 bag",
      title: "Chanel 19 Bag Medium Black",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).not.toBe("rejected");
    expect(out.matchScore).toBeGreaterThanOrEqual(60);
    expect(out.alertEligible).toBe(true);
  });

  it("10. Right brand, wrong model with exact-model enabled — score drops, still surfaces", () => {
    const pref = buildPreference({
      exactModelEnabled: true,
      modelQuery: "classic flap",
      allowCloseMatches: false,
    });
    const listing = buildListing({
      model: "19 Bag",
      normalizedModel: "19 bag",
      title: "Chanel 19 Bag Medium Black",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.disqualifiers.some((d) => d.field === "model")).toBe(true);
    // Loses 35 model pts → score = 65
    expect(out.matchScore).toBe(65);
    expect(out.matchType).toBe("close");
  });

  it("11. Style mismatch only — strong match (loses 15)", () => {
    const pref = buildPreference({
      styles: ["tote"],
    });
    const listing = buildListing();
    const out = evaluateMatch(pref, listing);

    expect(out.matchScore).toBe(85);
    expect(out.matchType).toBe("strong");
    expect(out.disqualifiers.some((d) => d.field === "style")).toBe(true);
  });
});

describe("matchEngine — close color match", () => {
  it("12. Close color match accepted via family when allowCloseColorMatch=true", () => {
    const pref = buildPreference({
      colors: ["beige"],
      colorFamilies: ["neutral"],
    });
    const listing = buildListing({
      color: "Cream",
      normalizedColor: "cream",
      colorFamily: "neutral",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).not.toBe("rejected");
    expect(
      out.matchReasons.find((r) => r.field === "color")?.detail,
    ).toMatch(/close color/i);
    // Half color credit: 100 - 7.5 = 92.5
    expect(out.matchScore).toBe(92.5);
  });

  it("13. Close color match REJECTED when allowCloseColorMatch=false", () => {
    const pref = buildPreference({
      colors: ["beige"],
      colorFamilies: ["neutral"],
      allowCloseColorMatch: false,
    });
    const listing = buildListing({
      color: "Cream",
      normalizedColor: "cream",
      colorFamily: "neutral",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.disqualifiers.some((d) => d.field === "color")).toBe(true);
    expect(out.matchScore).toBe(85);
  });

  it("14. Different color family — disqualifier even with close-match enabled", () => {
    const pref = buildPreference({
      colors: ["black"],
      colorFamilies: ["dark"],
    });
    const listing = buildListing({
      color: "Pink",
      normalizedColor: "pink",
      colorFamily: "warm",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.disqualifiers.some((d) => d.field === "color")).toBe(true);
    expect(out.matchScore).toBe(85);
  });
});

describe("matchEngine — onlyExactCriteria strict mode", () => {
  it("15. Strict mode — color mismatch rejects the listing", () => {
    const pref = buildPreference({
      onlyExactCriteria: true,
      colors: ["black"],
      colorFamilies: ["dark"],
      allowCloseColorMatch: false,
    });
    const listing = buildListing({
      color: "White",
      normalizedColor: "white",
      colorFamily: "neutral",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("rejected");
    expect(out.alertEligible).toBe(false);
  });

  it("16. Strict mode — style mismatch does NOT reject (style not in strict list per spec)", () => {
    // Per the spec, only_exact_criteria rejects on brand, model, price,
    // condition, color, or size — style is intentionally excluded so users
    // can still surface listings that are categorized differently by
    // different vendors.
    const pref = buildPreference({
      onlyExactCriteria: true,
      styles: ["tote"],
    });
    const listing = buildListing(); // shoulder bag
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).not.toBe("rejected");
    expect(out.disqualifiers.some((d) => d.field === "style")).toBe(true);
    expect(out.alertEligible).toBe(true);
  });

  it("17. Strict mode — perfect match still accepted", () => {
    const pref = buildPreference({
      onlyExactCriteria: true,
      sizes: ["medium"],
      minPrice: 4000,
      maxPrice: 5000,
      conditionMinRank: 4,
      conditionMinName: "Very Good",
      exactModelEnabled: true,
      modelQuery: "classic flap",
    });
    const listing = buildListing();
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("exact");
    expect(out.matchScore).toBe(100);
    expect(out.alertEligible).toBe(true);
  });
});

describe("matchEngine — close-match price buffer", () => {
  it("18. Price within ±10% buffer accepted at half credit when allowCloseMatches=true", () => {
    const pref = buildPreference({
      minPrice: 4000,
      maxPrice: 5000,
      allowCloseMatches: true,
    });
    // 5% above max — within 10% buffer
    const listing = buildListing({ price: 5250 });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).not.toBe("rejected");
    const priceReason = out.matchReasons.find((r) => r.field === "price");
    expect(priceReason?.detail).toMatch(/within 10%/i);
    // Loses 5 price pts → 95
    expect(out.matchScore).toBe(95);
  });

  it("19. Price beyond ±10% buffer rejected even with allowCloseMatches=true", () => {
    const pref = buildPreference({
      minPrice: 4000,
      maxPrice: 5000,
      allowCloseMatches: true,
    });
    const listing = buildListing({ price: 6500 });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("rejected");
    expect(out.alertEligible).toBe(false);
  });
});

describe("matchEngine — multiple brand preference", () => {
  it("20. Multiple brand preference — listing matches one of them", () => {
    const pref = buildPreference({
      brands: ["chanel", "hermes", "louis vuitton"],
    });
    const listing = buildListing({
      brand: "Hermès",
      normalizedBrand: "hermes",
      model: "Birkin",
      normalizedModel: "birkin",
      title: "Hermès Birkin 30 Black",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).not.toBe("rejected");
    expect(out.matchReasons.find((r) => r.field === "brand")?.value).toBe("Hermès");
  });

  it("21. Multiple brand preference — listing matches none, rejected", () => {
    const pref = buildPreference({
      brands: ["chanel", "hermes"],
    });
    const listing = buildListing({
      brand: "Gucci",
      normalizedBrand: "gucci",
      model: "Marmont",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).toBe("rejected");
    expect(out.disqualifiers[0].field).toBe("brand");
  });
});

describe("matchEngine — additional edge cases", () => {
  it("22. No brand preference set — brand gate is skipped", () => {
    const pref = buildPreference({
      brands: [],
      styles: [],
      colors: [],
    });
    const listing = buildListing({
      brand: "Anything",
      normalizedBrand: "anything",
    });
    const out = evaluateMatch(pref, listing);

    expect(out.matchType).not.toBe("rejected");
    expect(out.matchScore).toBe(100);
  });

  it("23. Exact-model substring match awards full 35 model points", () => {
    const pref = buildPreference({
      exactModelEnabled: true,
      modelQuery: "classic flap",
    });
    const listing = buildListing();
    const out = evaluateMatch(pref, listing);

    const modelReason = out.matchReasons.find((r) => r.field === "model");
    expect(modelReason?.weight).toBe(35);
  });

  it("24. Fuzzy model match (close-match mode) awards half model credit", () => {
    const pref = buildPreference({
      exactModelEnabled: true,
      modelQuery: "classic flap medium",
      allowCloseMatches: true,
    });
    const listing = buildListing({
      // Two of three tokens hit ("classic", "flap"), but not "medium" — but
      // listing title contains "Medium" so all three match. Use a model
      // where only 2/3 tokens hit.
      title: "Chanel Classic Flap Large Caviar",
      model: "Classic Flap Large",
      normalizedModel: "classic flap large",
    });
    const out = evaluateMatch(pref, listing);

    const modelReason = out.matchReasons.find((r) => r.field === "model");
    // "classic flap medium" — listing has classic+flap but not medium → 2/3 ≥ 50% fuzzy
    expect(modelReason?.weight).toBe(35 / 2);
    expect(out.matchType).not.toBe("rejected");
  });

  it("25. alertEligible is false for weak matches", () => {
    const pref = buildPreference({
      exactModelEnabled: true,
      modelQuery: "birkin",
      allowCloseMatches: false,
      styles: ["tote"],
      colors: ["red"],
      colorFamilies: ["warm"],
      sizes: ["large"],
      allowCloseColorMatch: false,
    });
    const listing = buildListing({
      // Brand matches (chanel), but model+style+color+size all miss
      colorFamily: "dark",
    });
    const out = evaluateMatch(pref, listing);

    // Loses 35 (model) + 15 (style) + 15 (color) + 10 (size) = 75 → score 25
    expect(out.matchScore).toBe(25);
    expect(out.matchType).toBe("rejected");
    expect(out.alertEligible).toBe(false);
  });
});
