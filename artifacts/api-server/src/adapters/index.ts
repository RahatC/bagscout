import ebay, { ebayLiveAdapter, ebayMockAdapter } from "./ebay";
import fashionphile, {
  fashionphileLiveAdapter,
  fashionphileMockAdapter,
} from "./fashionphile";
import rebag, { rebagLiveAdapter, rebagMockAdapter } from "./rebag";
import therealreal from "./therealreal";
import yoogiscloset from "./yoogiscloset";
import { createMockAdapter, shouldUseMockAdapters } from "./base";
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
  { slug: "fashionphile", live: fashionphileLiveAdapter, mock: fashionphileMockAdapter },
  { slug: "rebag", live: rebagLiveAdapter, mock: rebagMockAdapter },
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
  const pair = bySlug.get(slug);
  if (!pair) return undefined;
  // Honor the same mock-only default as getAdapterForSource so this legacy
  // entry point can't silently bypass the compliance gate.
  return shouldUseMockAdapters() ? pair.mock : pair.live;
}

/**
 * Per-source dispatcher.
 *
 * A source only ingests live when BOTH conditions hold:
 *   1. its DB row sets `ingestion_mode = 'live'`, AND
 *   2. live adapters are explicitly enabled via `INGEST_USE_MOCK_ADAPTERS=false`.
 *
 * The global mock-only default (`shouldUseMockAdapters()` returns `true` when
 * the env is unset) is authoritative: it wins over the per-source DB mode.
 * This makes production mock-only by default — matching the documented
 * compliance policy — so a freshly-migrated database (which seeds
 * fashionphile/rebag to `live`) does NOT start issuing live HTTP requests to
 * third-party retailers unless an operator has deliberately opted in. Live
 * ingestion remains fully available behind that explicit flag.
 *
 * The eBay live adapter additionally falls back to mock when its credentials
 * are missing.
 */
export function getAdapterForSource(
  slug: string,
  mode: "live" | "mock" | string,
): SourceAdapter | undefined {
  const pair = bySlug.get(slug);
  if (!pair) return undefined;
  const liveAllowed = mode === "live" && !shouldUseMockAdapters();
  return liveAllowed ? pair.live : pair.mock;
}

export type { SourceAdapter, RawListing, NormalizedListing, ValidationResult } from "./types";
