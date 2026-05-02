/**
 * Normalization helpers for the matching engine and source adapters.
 * All values are lowercased, trimmed, and have diacritics stripped.
 *
 * The canonical "normalized" form for brand / color / condition is the value
 * written into reference table `normalized_name` columns at seed time, which
 * is `normalizeText(canonicalName)`. The matching engine compares listing
 * normalized fields directly against those reference rows, so adapters must
 * map raw vendor strings (e.g. "YSL", "Hermes", "Caramel") to those exact
 * canonical normalized forms.
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// Brand aliases — keys are normalizeText() of any vendor variant we may see;
// values are normalizeText() of the canonical brand name in `brands` seed.
// ---------------------------------------------------------------------------
const BRAND_ALIASES: Record<string, string> = {
  // Hermès
  hermes: "hermes",
  "hermes paris": "hermes",
  // Chanel
  chanel: "chanel",
  "coco chanel": "chanel",
  // Louis Vuitton
  "louis vuitton": "louis vuitton",
  lv: "louis vuitton",
  // Saint Laurent
  "saint laurent": "saint laurent",
  ysl: "saint laurent",
  "yves saint laurent": "saint laurent",
  // Dior
  dior: "dior",
  "christian dior": "dior",
  // Gucci
  gucci: "gucci",
  // Prada
  prada: "prada",
  // Celine
  celine: "celine",
  // Goyard
  goyard: "goyard",
  "maison goyard": "goyard",
  // Bottega Veneta
  "bottega veneta": "bottega veneta",
  bottega: "bottega veneta",
  bv: "bottega veneta",
  // Fendi
  fendi: "fendi",
  // Loewe
  loewe: "loewe",
  // Miu Miu
  "miu miu": "miu miu",
};

export function normalizeBrand(input: string | null | undefined): string {
  const t = normalizeText(input);
  return BRAND_ALIASES[t] ?? t;
}

// ---------------------------------------------------------------------------
// Color aliases — match the canonical 15 colors seeded in `colors`.
// ---------------------------------------------------------------------------
const COLOR_ALIASES: Record<string, string> = {
  black: "black",
  noir: "black",
  white: "white",
  blanc: "white",
  cream: "cream",
  ivory: "cream",
  ecru: "cream",
  beige: "beige",
  taupe: "beige",
  etoupe: "beige",
  sand: "beige",
  nude: "beige",
  greige: "beige",
  tan: "tan",
  caramel: "tan",
  cognac: "tan",
  camel: "tan",
  saddle: "tan",
  honey: "tan",
  brown: "brown",
  chocolate: "brown",
  espresso: "brown",
  ebene: "brown",
  mocha: "brown",
  gray: "gray",
  grey: "gray",
  graphite: "gray",
  anthracite: "gray",
  charcoal: "gray",
  etain: "gray",
  navy: "navy",
  midnight: "navy",
  marine: "navy",
  blue: "blue",
  cobalt: "blue",
  sapphire: "blue",
  red: "red",
  rouge: "red",
  vermillion: "red",
  burgundy: "burgundy",
  bordeaux: "burgundy",
  oxblood: "burgundy",
  wine: "burgundy",
  pink: "pink",
  rose: "pink",
  blush: "pink",
  fuchsia: "pink",
  green: "green",
  emerald: "green",
  jade: "green",
  parakeet: "green",
  olive: "green",
  forest: "green",
  gold: "gold",
  golden: "gold",
  silver: "silver",
  metallic: "silver",
};

export function normalizeColor(input: string | null | undefined): string {
  const t = normalizeText(input);
  if (!t) return "";
  if (COLOR_ALIASES[t]) return COLOR_ALIASES[t];
  // Try first matching token (e.g. "blush pink lambskin" → pink)
  for (const token of t.split(/\s+/)) {
    if (COLOR_ALIASES[token]) return COLOR_ALIASES[token];
  }
  // Try compound tokens (e.g. "dark blue")
  const tokens = t.split(/\s+/);
  for (let i = 0; i < tokens.length - 1; i++) {
    const compound = `${tokens[i]} ${tokens[i + 1]}`;
    if (COLOR_ALIASES[compound]) return COLOR_ALIASES[compound];
  }
  return t;
}

// ---------------------------------------------------------------------------
// Condition aliases — match the 6 canonical conditions seeded in `conditions`.
// ---------------------------------------------------------------------------
const CONDITION_ALIASES: Record<string, string> = {
  "new with tags": "new with tags",
  new: "new with tags",
  nwt: "new with tags",
  "brand new": "new with tags",
  unworn: "new with tags",
  pristine: "pristine",
  mint: "pristine",
  "mint condition": "pristine",
  "like new": "pristine",
  excellent: "excellent",
  "excellent condition": "excellent",
  "very good": "very good",
  vgc: "very good",
  "very good condition": "very good",
  good: "good",
  "good condition": "good",
  fair: "fair",
  acceptable: "fair",
  used: "fair",
};

export function normalizeCondition(input: string | null | undefined): string {
  const t = normalizeText(input);
  return CONDITION_ALIASES[t] ?? t;
}

const CONDITION_RANKS: Record<string, number> = {
  "new with tags": 1,
  pristine: 2,
  excellent: 3,
  "very good": 4,
  good: 5,
  fair: 6,
};

export function conditionRank(condition: string | null | undefined): number {
  return CONDITION_RANKS[normalizeCondition(condition ?? "")] ?? 99;
}

// ---------------------------------------------------------------------------
// Style inference — title-keyword based fallback when adapters don't supply
// a style. Maps to the 11 canonical bag_styles seed values.
// ---------------------------------------------------------------------------
const STYLE_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(birkin|kelly|lady dior|picotin|bolide|peekaboo|galleria|capucines|coco handle|garden party|alma|bobby)\b/i, "Top Handle"],
  [/\b(neverfull|saint louis|cabas|onthego|on the go|book tote|garden party|anjou)\b/i, "Tote"],
  [/\b(speedy|keepall|bandouliere)\b/i, "Top Handle"],
  [/\b(tote)\b/i, "Tote"],
  [/\b(crossbody|wallet on chain|woc|nano|micro|evelyne|constance|pochette metis|cassette|sunset)\b/i, "Crossbody"],
  [/\b(classic flap|boy bag|baguette|dionysus|sylvie|marmont|reissue|niki|loulou|kate|jodie shoulder|envelope|saddle|diorama|bobby|cleo|symbole|hammock|puzzle|jackie|coffer|book tote|montaigne|wander|matelasse|matelassé|peekaboo iseeu|picotin lock)\b/i, "Shoulder Bag"],
  [/\b(clutch|pochette|envelope|the pouch|pouch)\b/i, "Clutch"],
  [/\b(hobo|jodie|lindy)\b/i, "Hobo"],
  [/\b(bucket|noe|petit noe)\b/i, "Bucket Bag"],
  [/\b(backpack)\b/i, "Backpack"],
  [/\b(belt bag|bumbag|fanny|waist bag)\b/i, "Belt Bag"],
  [/\b(evening|minaudiere|minaudière)\b/i, "Evening Bag"],
  [/\b(luggage|travel|weekender|keepall|garment)\b/i, "Travel/Luggage"],
];

export function inferStyle(title: string, fallback?: string | null): string {
  for (const [pattern, style] of STYLE_KEYWORDS) {
    if (pattern.test(title)) return style;
  }
  return fallback?.trim() || "Shoulder Bag";
}

// ---------------------------------------------------------------------------
// Model extraction from title when adapters omit it.
// Strips brand, hardware codes, and noisy descriptors; keeps the next 1-4
// salient words as the model.
// ---------------------------------------------------------------------------
const MODEL_STOP_WORDS = new Set([
  "in", "with", "and", "the", "a", "an",
  "shoulder", "tote", "clutch", "crossbody", "hobo", "bucket",
  "bag", "handbag", "purse",
  "leather", "lambskin", "caviar", "epsom", "togo", "clemence", "clémence",
  "monogram", "canvas", "calfskin", "saffiano", "intrecciato", "vernis", "epi",
  "ghw", "phw", "shw", "rghw",
  "small", "medium", "large", "mini", "micro", "nano", "jumbo", "pm", "mm", "gm", "bb",
]);

export function extractModel(
  title: string,
  brandCanonical: string,
  fallback?: string | null,
): string {
  if (fallback && fallback.trim()) return fallback.trim();
  const normalizedBrand = normalizeText(brandCanonical);
  const normalizedTitle = normalizeText(title);
  let stripped = normalizedTitle;
  if (normalizedBrand && stripped.startsWith(normalizedBrand)) {
    stripped = stripped.slice(normalizedBrand.length).trim();
  }
  const taken: string[] = [];
  for (const word of stripped.split(/\s+/)) {
    if (taken.length >= 4) break;
    if (MODEL_STOP_WORDS.has(word)) {
      if (taken.length > 0) break;
      continue;
    }
    if (/^\d+$/.test(word) && taken.length === 0) {
      // Skip pure numbers at the start
      continue;
    }
    taken.push(word);
  }
  return taken.length > 0 ? taken.join(" ") : stripped.split(/\s+/).slice(0, 2).join(" ");
}
