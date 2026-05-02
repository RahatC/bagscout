import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  extractColor,
  extractCondition,
  extractSize,
  parsePrice,
  stripHtml,
} from "./parse";

describe("parsePrice", () => {
  it("parses common formats", () => {
    expect(parsePrice("$1,250.00")).toBe(1250);
    expect(parsePrice("USD 1250")).toBe(1250);
    expect(parsePrice("19425.00")).toBe(19425);
    expect(parsePrice("$22,000")).toBe(22000);
    expect(parsePrice("3420")).toBe(3420);
  });

  it("returns null for missing or invalid input", () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("free")).toBeNull();
    expect(parsePrice("0")).toBeNull();
  });

  it("handles european-formatted thousands separators", () => {
    // "1.234.56" → drops the early thousands dots, keeps the cents.
    expect(parsePrice("1.234.56")).toBe(1234.56);
  });
});

describe("extractColor", () => {
  it("finds a color keyword in a free-text title", () => {
    expect(extractColor("Hermès Birkin 30 Etoupe Togo")).toBe("Etoupe");
    expect(extractColor("Chanel Black Caviar Classic Flap")).toBe("Black");
    expect(extractColor("Bottega Veneta Jodie Parakeet Medium")).toBe("Parakeet");
  });

  it("falls back when no keyword matches", () => {
    expect(extractColor("Some weird title", "Multi")).toBe("Multi");
    expect(extractColor("Some weird title")).toBe("");
  });
});

describe("extractSize", () => {
  it("captures Hermès model+number sizes", () => {
    expect(extractSize("Hermès Birkin 30 Etoupe Togo")).toBe("Birkin 30");
    expect(extractSize("Hermès Kelly 28 Sellier Gold")).toBe("Kelly 28");
  });

  it("captures Speedy/Keepall model+number sizes", () => {
    expect(extractSize("LV Speedy 25 Damier")).toBe("Speedy 25");
  });

  it("captures size keywords", () => {
    expect(extractSize("Chanel Medium Classic Flap")).toBe("Medium");
    expect(extractSize("Goyard Saint Louis PM")).toBe("PM");
  });

  it("falls back when nothing matches", () => {
    expect(extractSize("Random Bag")).toBe("Medium");
    expect(extractSize("Random Bag", "Large")).toBe("Large");
  });
});

describe("extractCondition", () => {
  it("maps phrases to canonical conditions", () => {
    expect(extractCondition("Brand new with tags")).toBe("New with tags");
    expect(extractCondition("pristine like new")).toBe("Pristine");
    expect(extractCondition("Excellent condition")).toBe("Excellent");
    expect(extractCondition("VGC")).toBe("Very Good");
    expect(extractCondition("Gently used")).toBe("Very Good");
    expect(extractCondition("Good condition")).toBe("Good");
    expect(extractCondition("Acceptable")).toBe("Fair");
  });

  it("returns the fallback when nothing matches", () => {
    expect(extractCondition("nothing relevant")).toBe("Good");
    expect(extractCondition("nothing relevant", "Excellent")).toBe("Excellent");
    expect(extractCondition(null)).toBe("Good");
  });
});

describe("decodeEntities + stripHtml", () => {
  it("decodes entities", () => {
    expect(decodeEntities("Hermès &amp; Co.")).toBe("Hermès & Co.");
    expect(decodeEntities("&quot;hello&quot;")).toBe('"hello"');
  });

  it("strips tags + collapses whitespace", () => {
    const html = "<p>This is\n <b>authentic</b> &amp; <i>used</i>.</p>";
    expect(stripHtml(html)).toBe("This is authentic & used.");
  });

  it("returns null for empty input", () => {
    expect(stripHtml(null)).toBeNull();
    expect(stripHtml(undefined)).toBeNull();
    expect(stripHtml("")).toBeNull();
  });
});
