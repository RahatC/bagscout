import { describe, it, expect } from "vitest";
import {
  normalizeText,
  normalizeBrand,
  normalizeColor,
  normalizeCondition,
  conditionRank,
  inferStyle,
  extractModel,
} from "./normalize";

describe("normalizeText", () => {
  it("lowercases, trims, and strips diacritics", () => {
    expect(normalizeText("  Hermès  ")).toBe("hermes");
    expect(normalizeText("CÉLINE")).toBe("celine");
  });

  it("handles null / undefined / empty", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText("")).toBe("");
  });
});

describe("normalizeBrand", () => {
  it("maps common vendor variants to canonical normalized brand", () => {
    expect(normalizeBrand("Hermès")).toBe("hermes");
    expect(normalizeBrand("YSL")).toBe("saint laurent");
    expect(normalizeBrand("Yves Saint Laurent")).toBe("saint laurent");
    expect(normalizeBrand("LV")).toBe("louis vuitton");
    expect(normalizeBrand("Christian Dior")).toBe("dior");
    expect(normalizeBrand("Bottega")).toBe("bottega veneta");
  });

  it("falls back to normalized text for unknown brands", () => {
    expect(normalizeBrand("Some New Brand")).toBe("some new brand");
  });
});

describe("normalizeColor", () => {
  it("maps direct color aliases", () => {
    expect(normalizeColor("Noir")).toBe("black");
    expect(normalizeColor("Etoupe")).toBe("beige");
    expect(normalizeColor("Caramel")).toBe("tan");
    expect(normalizeColor("Bordeaux")).toBe("burgundy");
  });

  it("matches a token within a multi-word color string", () => {
    expect(normalizeColor("blush pink lambskin")).toBe("pink");
    expect(normalizeColor("dark chocolate")).toBe("brown");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizeColor(null)).toBe("");
    expect(normalizeColor("")).toBe("");
  });

  it("returns normalized text for unknown colors", () => {
    expect(normalizeColor("Periwinkle")).toBe("periwinkle");
  });
});

describe("normalizeCondition + conditionRank", () => {
  it("maps condition aliases", () => {
    expect(normalizeCondition("NWT")).toBe("new with tags");
    expect(normalizeCondition("Like New")).toBe("pristine");
    expect(normalizeCondition("VGC")).toBe("very good");
  });

  it("returns ranks 1-6 in best-to-worst order", () => {
    expect(conditionRank("NWT")).toBe(1);
    expect(conditionRank("Pristine")).toBe(2);
    expect(conditionRank("Excellent")).toBe(3);
    expect(conditionRank("Very Good")).toBe(4);
    expect(conditionRank("Good")).toBe(5);
    expect(conditionRank("Fair")).toBe(6);
  });

  it("returns sentinel rank 99 for unknown / empty conditions", () => {
    expect(conditionRank(null)).toBe(99);
    expect(conditionRank("Unknown Grade")).toBe(99);
  });
});

describe("inferStyle", () => {
  it("infers style from title keywords", () => {
    expect(inferStyle("Hermès Birkin 30 Etoupe Togo")).toBe("Top Handle");
    expect(inferStyle("Louis Vuitton Neverfull MM")).toBe("Tote");
    expect(inferStyle("Chanel Classic Flap Medium")).toBe("Shoulder Bag");
    expect(inferStyle("YSL Loulou Crossbody")).toBe("Crossbody");
    expect(inferStyle("Bottega Pouch Clutch")).toBe("Clutch");
  });

  it("falls back to provided fallback or default Shoulder Bag", () => {
    expect(inferStyle("Mystery Item", "Hobo")).toBe("Hobo");
    expect(inferStyle("No keyword match here")).toBe("Shoulder Bag");
  });
});

describe("extractModel", () => {
  it("uses fallback when provided", () => {
    expect(extractModel("Anything", "Chanel", "Classic Flap")).toBe("Classic Flap");
  });

  it("strips brand prefix and stop words from title", () => {
    const m = extractModel("Chanel Medium Classic Flap Black Caviar GHW", "Chanel");
    expect(m).toContain("classic");
    expect(m).toContain("flap");
    expect(m).not.toContain("medium");
    expect(m).not.toContain("ghw");
  });

  it("keeps at most 4 model tokens", () => {
    const m = extractModel(
      "Hermes Birkin Sellier Veau Madame Vert Jade Gold Hardware",
      "Hermes",
    );
    expect(m.split(/\s+/).length).toBeLessThanOrEqual(4);
  });
});
