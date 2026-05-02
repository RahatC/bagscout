/**
 * Field extraction helpers shared by per-source HTML/JSON parsers.
 *
 * These helpers are **format-aware** but **source-agnostic**: they take raw
 * vendor strings (titles, condition labels, descriptions) and pull out
 * structured fields (color, size, condition) using simple keyword tables.
 *
 * Adapters then hand the result to `defaultNormalize()` which canonicalizes
 * everything against the reference seed tables.
 */

const COLOR_KEYWORDS = [
  "black",
  "noir",
  "white",
  "blanc",
  "ivory",
  "cream",
  "ecru",
  "beige",
  "taupe",
  "etoupe",
  "sand",
  "nude",
  "greige",
  "tan",
  "caramel",
  "cognac",
  "camel",
  "saddle",
  "honey",
  "brown",
  "chocolate",
  "espresso",
  "ebene",
  "mocha",
  "gray",
  "grey",
  "graphite",
  "anthracite",
  "charcoal",
  "etain",
  "navy",
  "midnight",
  "marine",
  "cobalt",
  "sapphire",
  "blue",
  "red",
  "rouge",
  "vermillion",
  "burgundy",
  "bordeaux",
  "oxblood",
  "wine",
  "pink",
  "rose",
  "blush",
  "fuchsia",
  "green",
  "emerald",
  "jade",
  "parakeet",
  "olive",
  "forest",
  "gold",
  "golden",
  "silver",
  "metallic",
  "purple",
  "lilac",
  "lavender",
  "yellow",
  "orange",
];

/** Try to find a known color name inside a free-text title. */
export function extractColor(title: string, fallback?: string | null): string {
  const lower = title.toLowerCase();
  for (const c of COLOR_KEYWORDS) {
    // Match as a whole word.
    const re = new RegExp(`\\b${c}\\b`, "i");
    if (re.test(lower)) {
      // Capitalise first letter for the "raw" field; normalize layer will
      // fold it back to canonical.
      return c.charAt(0).toUpperCase() + c.slice(1);
    }
  }
  return (fallback ?? "").trim();
}

const SIZE_PATTERNS: RegExp[] = [
  /\b(birkin|kelly|constance|bolide|lindy|picotin|evelyne|garden party)\s+(\d{2})\b/i,
  /\b(speedy|keepall)\s+(\d{2})\b/i,
  /\b(mini|micro|nano|small|medium|large|jumbo|maxi|tpm|pm|mm|gm|bb)\b/i,
  /\bsize[:\s]+([a-z0-9]+)\b/i,
];

/**
 * Pull a size hint out of a title string. Falls back to the supplied default.
 */
export function extractSize(title: string, fallback?: string | null): string {
  for (const re of SIZE_PATTERNS) {
    const m = title.match(re);
    if (!m) continue;
    // For the model-with-number patterns, return the full matched chunk
    // (e.g. "Birkin 30") so it lines up with the reference sizes seed.
    return m[0].trim();
  }
  return (fallback ?? "Medium").trim();
}

const CONDITION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(brand new|nwt|new with tags|unworn)\b/i, "New with tags"],
  [/\b(pristine|mint|like new)\b/i, "Pristine"],
  [/\bexcellent\b/i, "Excellent"],
  [/\b(very good|vgc)\b/i, "Very Good"],
  [/\bgently used\b/i, "Very Good"],
  [/\bgood\b/i, "Good"],
  [/\b(fair|acceptable)\b/i, "Fair"],
  [/\bused\b/i, "Good"],
];

/** Map a free-text condition phrase onto one of the canonical 6 conditions. */
export function extractCondition(text: string | null | undefined, fallback = "Good"): string {
  if (!text) return fallback;
  for (const [re, label] of CONDITION_PATTERNS) {
    if (re.test(text)) return label;
  }
  return fallback;
}

/**
 * Parse a price string like "$1,250.00", "1250.00", "USD 1,250" into a number.
 * Returns null when no digits were found.
 */
export function parsePrice(input: string | null | undefined): number | null {
  if (!input) return null;
  const stripped = String(input).replace(/[^\d.]/g, "");
  if (!stripped) return null;
  // Handle pathological cases like "1.234.56" by keeping only the last dot.
  const lastDot = stripped.lastIndexOf(".");
  let normalised = stripped;
  if (lastDot !== -1) {
    normalised =
      stripped.slice(0, lastDot).replace(/\./g, "") + stripped.slice(lastDot);
  }
  const n = Number(normalised);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Decode common HTML entities — sufficient for titles and short fields. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}

/**
 * Strip HTML tags from a description blob, collapse whitespace, and trim
 * to a reasonable length.
 */
export function stripHtml(input: string | null | undefined, maxLen = 600): string | null {
  if (!input) return null;
  const text = decodeEntities(
    input.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    // Tighten whitespace before common terminal punctuation that the
    // tag-stripping pass tends to leave gaps around.
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}
