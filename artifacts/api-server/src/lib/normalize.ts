/**
 * Normalization helpers for the matching engine.
 * All values are lowercased, trimmed, and have diacritics stripped.
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
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
  return CONDITION_RANKS[normalizeText(condition)] ?? 99;
}
