import ebay, { ebayLiveAdapter, ebayMockAdapter } from "./ebay";
import fashionphile from "./fashionphile";
import rebag from "./rebag";
import therealreal from "./therealreal";
import yoogiscloset from "./yoogiscloset";
import { createMockAdapter } from "./base";
import type { SourceAdapter } from "./types";

/**
 * Registry of all source adapters available to the ingestion engine.
 * Adapter `sourceSlug` must match the `sources.slug` reference seed row.
 *
 * Each entry exposes BOTH a live adapter (talks to a real, ToS-compliant
 * data surface) and a mock adapter (static fixtures for tests / when the
 * source is in `ingestion_mode = 'mock'`). `getAdapterForSource()` picks the
 * right one based on the DB row.
 */

interface AdapterPair {
  slug: string;
  live: SourceAdapter;
  mock: SourceAdapter;
}

// Keep the legacy `default` exports of fashionphile/rebag working — they
// already pick live-vs-mock based on env. We expose the same module's mock
// fallback directly so the registry can force-mock per source.
function emptyMock(slug: string, name: string, baseUrl: string): SourceAdapter {
  return createMockAdapter({ sourceName: name, sourceSlug: slug, baseUrl, listings: [] });
}

const PAIRS: AdapterPair[] = [
  { slug: "ebay", live: ebayLiveAdapter, mock: ebayMockAdapter },
  // Shopify storefront `/products.json` is an officially documented public
  // Shopify endpoint, exposed intentionally by these stores. Live is OK.
  { slug: "fashionphile", live: fashionphile, mock: emptyMock("fashionphile", "FASHIONPHILE", "https://www.fashionphile.com") },
  { slug: "rebag", live: rebag, mock: emptyMock("rebag", "Rebag", "https://shop.rebag.com") },
  // The RealReal & Yoogi's Closet only have HTML / sitemap surfaces. Live
  // ingestion of those would be HTML scraping in a gray area — disabled by
  // default. Operators should switch the source to ingestion_mode='mock' or
  // sign up for the partner / affiliate program before re-enabling.
  { slug: "therealreal", live: therealreal, mock: emptyMock("therealreal", "The RealReal", "https://www.therealreal.com") },
  { slug: "yoogiscloset", live: yoogiscloset, mock: emptyMock("yoogiscloset", "Yoogi's Closet", "https://www.yoogiscloset.com") },
];

const bySlug = new Map(PAIRS.map((p) => [p.slug, p]));

/** Default registry for legacy callers that don't know about per-source mode. */
export const adapters: SourceAdapter[] = [ebay, fashionphile, rebag, therealreal, yoogiscloset];

export function getAdapter(slug: string): SourceAdapter | undefined {
  return bySlug.get(slug)?.live;
}

/**
 * Per-source dispatcher: returns the live adapter when `mode === 'live'`,
 * otherwise the mock adapter. The eBay live adapter additionally falls back
 * to mock when its credentials are missing.
 */
export function getAdapterForSource(
  slug: string,
  mode: "live" | "mock" | string,
): SourceAdapter | undefined {
  const pair = bySlug.get(slug);
  if (!pair) return undefined;
  return mode === "live" ? pair.live : pair.mock;
}

export type { SourceAdapter, RawListing, NormalizedListing, ValidationResult } from "./types";
