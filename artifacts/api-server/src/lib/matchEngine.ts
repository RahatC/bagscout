/**
 * BagScout match engine.
 *
 * Pure, deterministic, side-effect-free function that scores a single
 * normalized listing against a single user bag preference. The engine has
 * NO database dependencies — all reference data (brand/style/color/size
 * lists, color family lookups, condition ranks) must be pre-resolved by the
 * caller. This keeps the engine fully unit-testable and lets the ingest
 * layer batch its DB lookups efficiently.
 *
 * Scoring (out of 100):
 *   - Brand        — gate (required when ≥1 brand selected, else neutral)
 *   - Model        — 35 (only when exactModelEnabled + modelQuery; else neutral)
 *   - Style        — 15
 *   - Condition    — 15
 *   - Color        — 15
 *   - Size         — 10
 *   - Price        — 10
 *
 * Hard gates (always reject when violated):
 *   - Brand mismatch
 *   - Condition below user-set minimum
 *   - Price outside user-set min/max (with optional ±10% buffer when
 *     allowCloseMatches is true)
 *
 * Soft mismatches (reduce score, only reject when onlyExactCriteria=true):
 *   - Model, style, color, size
 *
 * matchType thresholds (after gates pass):
 *   exact:    score ≥ 95 and no disqualifiers
 *   strong:   score ≥ 80
 *   close:    score ≥ 60
 *   weak:     score ≥ 40
 *   rejected: hard-gate failure OR onlyExactCriteria violation OR score < 40
 *
 * alertEligible = matchType ∈ {exact, strong, close}.
 */

import type { MatchReason, Disqualifier } from "@workspace/db";

export type MatchType = "exact" | "strong" | "close" | "weak" | "rejected";

export type PreferenceCriteria = {
  nickname: string;
  onlyExactCriteria: boolean;
  exactModelEnabled: boolean;
  allowCloseMatches: boolean;
  allowCloseColorMatch: boolean;
  modelQuery: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** Lower rank = better condition. Listings with rank > this are below minimum. */
  conditionMinRank: number | null;
  /** Pretty name of minimum condition, used in explanations. */
  conditionMinName: string | null;
  /** Canonical normalized brand names (lowercase, diacritics stripped). */
  brands: string[];
  /** Canonical normalized style names. */
  styles: string[];
  /** Canonical normalized color names. */
  colors: string[];
  /** Canonical normalized size names. */
  sizes: string[];
  /** Family strings of every selected color, used for close-match lookups. */
  colorFamilies: string[];
};

export type ListingFacts = {
  brand: string;
  model: string | null;
  style: string | null;
  condition: string | null;
  color: string | null;
  size: string | null;
  title: string;
  price: number;
  currency: string;
  normalizedBrand: string;
  normalizedModel: string | null;
  normalizedStyle: string | null;
  normalizedCondition: string | null;
  normalizedColor: string | null;
  normalizedSize: string | null;
  /** Pre-resolved ordinal rank of the listing's condition (lower = better). */
  conditionRank: number | null;
  /** Pre-resolved family of the listing's color (e.g. "neutral", "warm"). */
  colorFamily: string | null;
};

export type MatchEngineOutput = {
  /** 0–100 integer-ish score (rounded to 1 decimal place). */
  matchScore: number;
  matchType: MatchType;
  matchReasons: MatchReason[];
  disqualifiers: Disqualifier[];
  alertEligible: boolean;
  /** Plain-English summary suitable for the UI. */
  explanation: string;
};

const W_MODEL = 35;
const W_STYLE = 15;
const W_CONDITION = 15;
const W_COLOR = 15;
const W_SIZE = 10;
const W_PRICE = 10;

const PRICE_BUFFER_PCT = 0.1; // ±10% buffer when allowCloseMatches=true

const TH_EXACT = 95;
const TH_STRONG = 80;
const TH_CLOSE = 60;
const TH_WEAK = 40;

function fmtMoney(n: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function priceRangeLabel(min: number | null, max: number | null, currency: string): string {
  if (min != null && max != null) return `${fmtMoney(min, currency)}–${fmtMoney(max, currency)}`;
  if (max != null) return `under ${fmtMoney(max, currency)}`;
  if (min != null) return `over ${fmtMoney(min, currency)}`;
  return "any price";
}

/**
 * Substring "fuzzy" check used for close-match model lookups. Compares
 * tokenized words and considers it a match when ≥50% of the query tokens
 * appear anywhere in the haystack.
 */
function fuzzyContains(haystack: string, query: string): boolean {
  const h = haystack.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => h.includes(t)).length;
  return hits / tokens.length >= 0.5;
}

/**
 * The engine. Pure function — no DB, no I/O.
 */
export function evaluateMatch(
  preference: PreferenceCriteria,
  listing: ListingFacts,
): MatchEngineOutput {
  const reasons: MatchReason[] = [];
  const disqualifiers: Disqualifier[] = [];

  // Track which criteria the user actually selected — used for matchType=exact
  // (every selected criterion must fully match) and for the onlyExactCriteria
  // strict-mode evaluation.
  const requested = {
    brand: preference.brands.length > 0,
    model: preference.exactModelEnabled && !!preference.modelQuery,
    style: preference.styles.length > 0,
    color: preference.colors.length > 0,
    size: preference.sizes.length > 0,
    condition: preference.conditionMinRank != null,
    price: preference.minPrice != null || preference.maxPrice != null,
  };

  const fullyMatched = {
    brand: false,
    model: false,
    style: false,
    color: false,
    size: false,
    condition: false,
    price: false,
  };

  let hardGateFailed = false;
  const reject = (output?: Partial<MatchEngineOutput>): MatchEngineOutput => ({
    matchScore: 0,
    matchType: "rejected",
    matchReasons: reasons,
    disqualifiers,
    alertEligible: false,
    explanation: buildExplanation(
      preference,
      listing,
      reasons,
      disqualifiers,
      "rejected",
    ),
    ...output,
  });

  // -------------------------------------------------------------------------
  // 1. BRAND — hard gate when user selected any brand(s)
  // -------------------------------------------------------------------------
  if (requested.brand) {
    if (preference.brands.includes(listing.normalizedBrand)) {
      reasons.push({
        field: "brand",
        value: listing.brand,
        matched: true,
        weight: 0, // brand is a gate, not a scored field
      });
      fullyMatched.brand = true;
    } else {
      disqualifiers.push({
        field: "brand",
        value: listing.brand,
        reason: `Brand "${listing.brand}" is not in your selected brands`,
      });
      hardGateFailed = true;
      return reject();
    }
  }

  let score = 0;

  // -------------------------------------------------------------------------
  // 2. MODEL — only scored when user enabled exact-model search
  // -------------------------------------------------------------------------
  if (requested.model) {
    const query = preference.modelQuery!.toLowerCase().trim();
    const haystack = `${listing.normalizedModel ?? ""} ${listing.title.toLowerCase()}`;
    if (haystack.includes(query)) {
      score += W_MODEL;
      reasons.push({ field: "model", value: preference.modelQuery!, matched: true, weight: W_MODEL });
      fullyMatched.model = true;
    } else if (preference.allowCloseMatches && fuzzyContains(haystack, query)) {
      score += W_MODEL / 2;
      reasons.push({
        field: "model",
        value: listing.model ?? listing.title,
        matched: true,
        weight: W_MODEL / 2,
        detail: `Close match for "${preference.modelQuery}"`,
      });
    } else {
      disqualifiers.push({
        field: "model",
        value: listing.model ?? "(none)",
        reason: `Does not match "${preference.modelQuery}"`,
      });
    }
  } else {
    // User didn't request exact-model — give full credit (neutral).
    score += W_MODEL;
  }

  // -------------------------------------------------------------------------
  // 3. STYLE
  // -------------------------------------------------------------------------
  if (requested.style) {
    if (listing.normalizedStyle && preference.styles.includes(listing.normalizedStyle)) {
      score += W_STYLE;
      reasons.push({ field: "style", value: listing.style ?? "", matched: true, weight: W_STYLE });
      fullyMatched.style = true;
    } else {
      disqualifiers.push({
        field: "style",
        value: listing.style ?? "(none)",
        reason: "Style is not in your selected styles",
      });
    }
  } else {
    score += W_STYLE;
  }

  // -------------------------------------------------------------------------
  // 4. CONDITION — hard gate when user set a minimum
  // -------------------------------------------------------------------------
  if (requested.condition) {
    const minRank = preference.conditionMinRank!;
    const listingRank = listing.conditionRank;
    if (listingRank != null && listingRank <= minRank) {
      score += W_CONDITION;
      reasons.push({
        field: "condition",
        value: listing.condition ?? "",
        matched: true,
        weight: W_CONDITION,
      });
      fullyMatched.condition = true;
    } else {
      disqualifiers.push({
        field: "condition",
        value: listing.condition ?? "(unknown)",
        reason: preference.conditionMinName
          ? `Below your minimum condition "${preference.conditionMinName}"`
          : "Below your minimum condition",
      });
      hardGateFailed = true;
    }
  } else {
    score += W_CONDITION;
  }

  // -------------------------------------------------------------------------
  // 5. COLOR — exact match, or family match when allowCloseColorMatch=true
  // -------------------------------------------------------------------------
  if (requested.color) {
    const exact =
      listing.normalizedColor && preference.colors.includes(listing.normalizedColor);
    if (exact) {
      score += W_COLOR;
      reasons.push({ field: "color", value: listing.color ?? "", matched: true, weight: W_COLOR });
      fullyMatched.color = true;
    } else if (
      preference.allowCloseColorMatch &&
      listing.colorFamily &&
      preference.colorFamilies.includes(listing.colorFamily)
    ) {
      score += W_COLOR / 2;
      reasons.push({
        field: "color",
        value: listing.color ?? "(close family)",
        matched: true,
        weight: W_COLOR / 2,
        detail: `Close color match in the "${listing.colorFamily}" family`,
      });
    } else {
      disqualifiers.push({
        field: "color",
        value: listing.color ?? "(none)",
        reason: preference.allowCloseColorMatch
          ? "Color is not in your selected colors or close families"
          : "Color is not in your selected colors",
      });
    }
  } else {
    score += W_COLOR;
  }

  // -------------------------------------------------------------------------
  // 6. SIZE
  // -------------------------------------------------------------------------
  if (requested.size) {
    if (listing.normalizedSize && preference.sizes.includes(listing.normalizedSize)) {
      score += W_SIZE;
      reasons.push({ field: "size", value: listing.size ?? "", matched: true, weight: W_SIZE });
      fullyMatched.size = true;
    } else {
      disqualifiers.push({
        field: "size",
        value: listing.size ?? "(none)",
        reason: "Size is not in your selected sizes",
      });
    }
  } else {
    score += W_SIZE;
  }

  // -------------------------------------------------------------------------
  // 7. PRICE — hard gate, with optional ±10% buffer when allowCloseMatches
  // -------------------------------------------------------------------------
  if (requested.price) {
    const min = preference.minPrice;
    const max = preference.maxPrice;
    const inRange =
      (min == null || listing.price >= min) && (max == null || listing.price <= max);

    if (inRange) {
      score += W_PRICE;
      reasons.push({
        field: "price",
        value: fmtMoney(listing.price, listing.currency),
        matched: true,
        weight: W_PRICE,
      });
      fullyMatched.price = true;
    } else if (preference.allowCloseMatches) {
      const lo = min != null ? min * (1 - PRICE_BUFFER_PCT) : null;
      const hi = max != null ? max * (1 + PRICE_BUFFER_PCT) : null;
      const inBuffer =
        (lo == null || listing.price >= lo) && (hi == null || listing.price <= hi);
      if (inBuffer) {
        score += W_PRICE / 2;
        reasons.push({
          field: "price",
          value: fmtMoney(listing.price, listing.currency),
          matched: true,
          weight: W_PRICE / 2,
          detail: `Within 10% of your ${priceRangeLabel(min, max, listing.currency)} range`,
        });
      } else {
        disqualifiers.push({
          field: "price",
          value: fmtMoney(listing.price, listing.currency),
          reason: `Outside your ${priceRangeLabel(min, max, listing.currency)} range`,
        });
        hardGateFailed = true;
      }
    } else {
      disqualifiers.push({
        field: "price",
        value: fmtMoney(listing.price, listing.currency),
        reason: `Outside your ${priceRangeLabel(min, max, listing.currency)} range`,
      });
      hardGateFailed = true;
    }
  } else {
    score += W_PRICE;
  }

  // -------------------------------------------------------------------------
  // Hard-gate enforcement (price out of range, condition below minimum)
  // -------------------------------------------------------------------------
  if (hardGateFailed) return reject();

  // -------------------------------------------------------------------------
  // Strict mode — onlyExactCriteria rejects any disqualifier on a selected
  // criterion (brand/model/color/size in addition to the always-strict
  // condition + price already enforced above).
  // -------------------------------------------------------------------------
  if (preference.onlyExactCriteria) {
    const strictMissing = disqualifiers.find((d) =>
      ["brand", "model", "color", "size", "condition", "price"].includes(d.field),
    );
    if (strictMissing) return reject();
  }

  // -------------------------------------------------------------------------
  // Match type
  // -------------------------------------------------------------------------
  const rounded = Math.round(score * 10) / 10;
  let matchType: MatchType;
  if (rounded >= TH_EXACT && disqualifiers.length === 0 && allRequestedMatched(requested, fullyMatched)) {
    matchType = "exact";
  } else if (rounded >= TH_STRONG) {
    matchType = "strong";
  } else if (rounded >= TH_CLOSE) {
    matchType = "close";
  } else if (rounded >= TH_WEAK) {
    matchType = "weak";
  } else {
    matchType = "rejected";
  }

  const alertEligible =
    matchType === "exact" || matchType === "strong" || matchType === "close";

  return {
    matchScore: rounded,
    matchType,
    matchReasons: reasons,
    disqualifiers,
    alertEligible,
    explanation: buildExplanation(preference, listing, reasons, disqualifiers, matchType),
  };
}

function allRequestedMatched(
  requested: Record<string, boolean>,
  fullyMatched: Record<string, boolean>,
): boolean {
  for (const key of Object.keys(requested)) {
    if (requested[key] && !fullyMatched[key]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Plain-English explanation
// ---------------------------------------------------------------------------
function buildExplanation(
  pref: PreferenceCriteria,
  listing: ListingFacts,
  reasons: MatchReason[],
  disqualifiers: Disqualifier[],
  matchType: MatchType,
): string {
  // Subject phrase — use brand + model if we have them, else fall back to title.
  const subject =
    listing.brand && listing.model
      ? `${listing.brand} ${listing.model}`
      : listing.brand || listing.title;

  if (matchType === "rejected") {
    if (disqualifiers.length === 0) {
      return `${subject} did not match "${pref.nickname}".`;
    }
    const why = disqualifiers
      .map((d) => describeDisqualifier(d, pref, listing))
      .join("; ");
    return `${subject} did not match "${pref.nickname}" — ${why}.`;
  }

  // Build positive clauses in display order
  const clauses: string[] = [];
  const byField = new Map(reasons.map((r) => [r.field, r]));

  if (byField.has("color")) {
    clauses.push(`in ${listing.color ?? byField.get("color")!.value}`);
  }
  if (byField.has("style") && listing.style) {
    clauses.push(`${listing.style.toLowerCase()} style`);
  }
  if (byField.has("condition") && listing.condition) {
    clauses.push(`${listing.condition.toLowerCase()} condition`);
  }
  if (byField.has("size") && listing.size) {
    clauses.push(`size ${listing.size}`);
  }
  if (byField.has("price")) {
    const range = priceRangeLabel(pref.minPrice, pref.maxPrice, listing.currency);
    const priceStr = fmtMoney(listing.price, listing.currency);
    if (pref.minPrice != null || pref.maxPrice != null) {
      const detail = byField.get("price")!.detail;
      if (detail) {
        clauses.push(`${priceStr} is within 10% of your ${range} range`);
      } else {
        clauses.push(`${priceStr} is within your ${range} range`);
      }
    } else {
      clauses.push(`priced at ${priceStr}`);
    }
  }

  const verb =
    matchType === "exact"
      ? "Matched exactly"
      : matchType === "strong"
        ? "Strong match"
        : matchType === "close"
          ? "Close match"
          : "Partial match";

  let core: string;
  if (clauses.length === 0) {
    core = `${verb}: ${subject}`;
  } else {
    core = `${verb} because this is a ${subject}, ${clauses.join(", ")}`;
  }

  if (disqualifiers.length === 0) {
    return `${core}.`;
  }
  const buts = disqualifiers
    .map((d) => describeDisqualifier(d, pref, listing))
    .join("; ");
  return `${core}, but ${buts}.`;
}

function describeDisqualifier(
  d: Disqualifier,
  pref: PreferenceCriteria,
  listing: ListingFacts,
): string {
  switch (d.field) {
    case "price": {
      const range = priceRangeLabel(pref.minPrice, pref.maxPrice, listing.currency);
      return `${d.value} is outside your ${range} range`;
    }
    case "condition":
      return pref.conditionMinName
        ? `condition (${d.value}) is below your minimum "${pref.conditionMinName}"`
        : `condition (${d.value}) is below your minimum`;
    case "brand":
      return `${d.value} is not one of your selected brands`;
    case "model":
      return `model "${d.value}" doesn't match "${pref.modelQuery ?? ""}"`;
    case "style":
      return `style "${d.value}" is not in your selected styles`;
    case "color":
      return `color "${d.value}" is not in your selected colors`;
    case "size":
      return `size "${d.value}" is not in your selected sizes`;
    default:
      return `${d.field} (${d.value}) ${d.reason}`;
  }
}
