import fashionphile from "./fashionphile";
import rebag from "./rebag";
import therealreal from "./therealreal";
import yoogiscloset from "./yoogiscloset";
import type { SourceAdapter } from "./types";

/**
 * Registry of all source adapters available to the ingestion engine.
 * Adapter `sourceSlug` must match the `sources.slug` reference seed row.
 */
export const adapters: SourceAdapter[] = [
  fashionphile,
  rebag,
  therealreal,
  yoogiscloset,
];

const bySlug = new Map(adapters.map((a) => [a.sourceSlug, a]));

export function getAdapter(slug: string): SourceAdapter | undefined {
  return bySlug.get(slug);
}

export type { SourceAdapter, RawListing, NormalizedListing, ValidationResult } from "./types";
