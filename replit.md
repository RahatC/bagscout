# BagScout

## Overview

BagScout is a premium luxury bag resale alert web app. Users create **bag preferences** (a.k.a. "watchlists") describing the bags they want to track — brand(s), style(s), color(s), size(s), condition floor, price range, and matching strictness. The app ingests listings from mock resale marketplaces, runs a weighted matching engine, and produces alerts on matches and price drops.

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (Tailwind CSS, shadcn/ui, Framer Motion, Wouter routing)
- **Auth**: Clerk (whitelabel, custom appearance, proxy at `/api/clerk`)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`, currently v0.2.0)
- **Build**: esbuild (bundle for API server)

## Artifacts

- **bagscout** — React+Vite frontend at `/` (port from $PORT env var)
- **api-server** — Express API server at `/api` (port 8080)

## Architecture

### Libraries (`lib/`)
- `lib/api-spec` — OpenAPI spec (`openapi.yaml`) + Orval config. Run codegen here.
- `lib/api-zod` — Generated Zod schemas from OpenAPI spec (do not edit generated files)
- `lib/api-client-react` — Generated React Query hooks from OpenAPI spec (do not edit generated files)
- `lib/db` — Drizzle ORM schemas + database client

### Database Schema (`lib/db/src/schema/`)

**Reference (seeded)**
- `brands`, `bag_styles`, `colors` (with `family`), `sizes`, `conditions` (with `rank`), `sources`

**Domain**
- `users` — id is the Clerk user id (lazy upserted by `requireAuth`); minimal mirror of email + full_name
- `user_profiles`, `notification_preferences`
- `bag_preferences` — nickname, modelQuery + exactModelEnabled, conditionMinId, allowCloseColorMatch, minPrice/maxPrice, allowCloseMatches, onlyExactCriteria, active, alertFrequency (`realtime` | `daily` | `weekly`, default `realtime`)
- Junctions: `bag_preference_brands`, `bag_preference_styles`, `bag_preference_colors`, `bag_preference_sizes`
- `listings` — raw + `normalized_*` fields (brand, model, style, color, condition); `availability_status`; `source_id` FK
- `listing_snapshots` — append-only price/availability history
- `match_results` — `(preferenceId, listingId)` unique; `matchScore`, `matchType` (`exact` | `strong` | `close` | `weak`), `matchExplanation` (plain-English), `alertEligible`, `matchReasons[]`, `disqualifiers[]`
- `alerts` — `alertType` (new_match | price_drop | back_in_stock), `status` (pending | sent | read | dismissed)
- `saved_listings`
- `ingestion_logs`

### API Routes (`artifacts/api-server/src/routes/`)
- `reference.ts` — Public read of brands/styles/colors/sizes/conditions
- `preferences.ts` — CRUD bag preferences + GET /:id/matches (auth required)
- `listings.ts` — Browse listings + /featured (no auth)
- `matches.ts` — User's match results (auth required)
- `alerts.ts` — List alerts, mark read, mark all read (auth required)
- `saved.ts` — Save / unsave / list (auth required)
- `dashboard.ts` — Summary, recent matches, price drops (auth required)
- `admin.ts` — Sources health, ingestion logs, trigger ingest (**admin-only**)

### Middlewares (`artifacts/api-server/src/middlewares/`)
- `requireAuth` — Clerk auth + lazy upsert of local `users` row; sets `req.userId`
- `requireAdmin` — Must be chained after `requireAuth`; allows users in `ADMIN_USER_IDS` env var (comma-separated Clerk user ids) OR users with Clerk `publicMetadata.role === "admin"`. Returns 403 otherwise.

### Frontend Pages (`artifacts/bagscout/src/pages/`)
- `/` — Landing page (unauthenticated) / dashboard when signed in
- `/sign-in`, `/sign-up` — Clerk auth pages (fully branded)
- `/onboarding` — First-time guided 11-screen onboarding flow (full-screen, no AppLayout). Welcome → Brands (multi-select + search) → Styles → Exact Model toggle → Min Condition → Colors (with close-match toggle) → Size (generic + custom text) → Price → Match Strictness → Alert Frequency → Confirmation. Saves a bag preference via `POST /api/preferences`, then redirects to `/dashboard`. Custom size text is promoted to `sizeIds` if it matches a known size, otherwise composed onto `modelQuery` so user input is never dropped. Alert frequency choice is persisted to `localStorage` (no API endpoint yet).
- `/dashboard` — Stats + recent matches + price drops
- `/watchlists` — List, `/watchlists/new` (3-step multi-select form), `/watchlists/:id`
- `/listings` — Browse + filters, `/listings/:id`
- `/alerts` — Feed with mark-read
- `/saved` — Saved listings
- `/admin` — Source health + manual ingest trigger (admin-only on the backend)

## Listing Ingestion (`artifacts/api-server/src/adapters/`)

The ingestion system follows a formal `SourceAdapter` interface defined in `adapters/types.ts`. Every adapter exposes:

- `sourceName`, `sourceSlug`, `baseUrl`
- `fetchListings()` — returns raw listings as the source provides them
- `normalizeListing(raw)` — maps raw → canonical `NormalizedListing` (brand, color, condition, style, model all canonicalized)
- `validateListing(normalized)` — returns `{ valid, errors[] }`

`adapters/base.ts` provides default normalize + validate implementations and a `createMockAdapter` factory. The four registered adapters fetch live listings by default; setting `INGEST_USE_MOCK_ADAPTERS=true` swaps every adapter for its hand-curated mock equivalent (used by tests / offline dev).

### Live source strategies

- **Fashionphile** (`fashionphile.ts`) — Shopify storefront. Pulls JSON from `/collections/{handbags,shop-best-sellers,shop-new-arrivals}/products.json` (up to 4 pages × 50 products each). Mapping is shared with Rebag via `shopify.ts → mapShopifyProduct`.
- **Rebag** (`rebag.ts`) — Shopify storefront on `shop.rebag.com`. Pulls `/collections/{all,new-arrivals}/products.json`. A title-keyword filter drops non-handbag SKUs (wallets, belts, shoes, etc.).
- **Yoogi's Closet** (`yoogiscloset.ts`) — server-rendered Nuxt HTML. Fetches `/handbags/{brand}` for ~12 designer brands and parses microdata `Product` cards via cheerio (`parseYoogisListingHtml`).
- **The RealReal** (`therealreal.ts`) — JSON-LD `ItemList` parser via `parseTrrListingHtml`, with explicit detection for the PerimeterX captcha page. The site routinely returns 403/captcha to non-browser clients; in that state the adapter throws a recognisable error so the source row is marked **degraded** in `ingestion_logs` and the admin UI rather than silently empty.

### Shared infrastructure (`adapters/http.ts`, `adapters/parse.ts`)

- `httpFetch(url, kind, opts)` — timeout (default 15s), exponential backoff, retry on 408/425/429/5xx, optional `allow404`, identifies as `BagScoutBot/1.0` (or a real-browser UA when `asBrowser: true`).
- `RateLimiter(minIntervalMs)` — per-source token-bucket-style spacing. Each adapter holds its own limiter so a slow site can't starve another.
- `parse.ts` helpers — `parsePrice`, `extractColor`, `extractSize`, `extractCondition`, `decodeEntities`, `stripHtml`. Used by every adapter to fold raw vendor strings onto the canonical reference seed values.

### Error boundaries

`runMockIngest` already isolates each source by writing failures to `ingestion_logs` and returning errors instead of throwing. `runAllIngests` adds an outer try/catch around each per-source run so an unexpected throw never aborts the rest of the cycle.

### Tests + fixtures

`adapters/__fixtures__/` ships real captured snapshots:

- `fashionphile_handbags.json`, `rebag_handbags.json` — Shopify product feeds
- `yoogiscloset_handbags.html` — Nuxt SSR product cards

Parser tests (`*.test.ts` in `adapters/`) run against these fixtures with no network calls and cover the captcha-rejection path for The RealReal. `http.test.ts` exercises the retry / backoff / non-retryable-status logic with mocked fetch.

### Normalization (`artifacts/api-server/src/lib/normalize.ts`)

- `normalizeBrand` — alias map handles "YSL" → "saint laurent", "Hermes"/"Hermès" → "hermes", "LV" → "louis vuitton", "Bottega"/"BV" → "bottega veneta", "Christian Dior" → "dior", etc.
- `normalizeColor` — maps "Caramel"/"Cognac"/"Camel" → "tan", "Etoupe"/"Taupe"/"Sand" → "beige", "Ecru"/"Ivory" → "cream", "Bordeaux"/"Oxblood" → "burgundy", "Blush"/"Rose"/"Fuchsia" → "pink", "Etain"/"Anthracite"/"Charcoal" → "gray", "Parakeet"/"Olive"/"Emerald" → "green", "Metallic" → "silver", etc. Falls back to first matching token for compound names.
- `normalizeCondition` — maps "NWT"/"new"/"unworn" → "new with tags", "Mint"/"Like New" → "pristine", "VGC" → "very good", etc.
- `inferStyle` — title-keyword heuristic that maps Birkin/Kelly/Lady Dior → "Top Handle", Neverfull/Book Tote → "Tote", Classic Flap/Boy Bag/Baguette → "Shoulder Bag", Wallet on Chain/Constance/Evelyne → "Crossbody", etc.
- `extractModel` — strips brand prefix, hardware codes, and noisy descriptors ("in", "leather", "lambskin", "PHW", etc.) to extract the model name from the title when not explicitly provided.

### Ingestion engine (`artifacts/api-server/src/lib/ingest.ts`)

- `runMockIngest(slug)` — runs one adapter end-to-end: open `ingestion_logs` row → `fetch → normalize → validate → upsert listing (idempotent on `source_id + source_listing_id`) → append `listing_snapshots` → score against active preferences and persist alerts → close log row. Returns counts of `listingsAdded`, `listingsUpdated`, `listingsRejected`, plus `errors[]`.
- `runAllIngests()` — runs every registered adapter sequentially.
- `autoSeedIfEmpty()` — called from `index.ts` after the server starts. If `listings` is empty, runs every adapter once. No-op once data exists.
- `POST /api/admin/ingest` accepts `{ sourceSlug }`. The special slug `"all"` runs every adapter and returns rolled-up totals plus `perSource[]`.

## Matching Engine (`artifacts/api-server/src/lib/matchEngine.ts`)

A pure, dependency-free function `evaluateMatch(preference, listing)` returns:

```ts
{
  matchScore: number;          // 0–100
  matchType: "exact" | "strong" | "close" | "weak" | "rejected";
  matchReasons: { field, value, detail?, weight, matched }[];
  disqualifiers: { field, reason }[];
  alertEligible: boolean;      // false for "weak" and "rejected"
  explanation: string;         // plain-English summary
}
```

Weights (sum to 100):

| Field | Weight | Notes |
|---|---|---|
| model | 35 | Substring of `model_query` against listing title+model when `exactModelEnabled`; otherwise auto-credit |
| style | 15 | Any preferred style matches listing's `normalized_style` |
| condition | 15 | Listing's condition rank ≤ preference's `condition_min_id` rank |
| color | 15 | Exact match, or 50% credit (7.5) when `allowCloseColorMatch` and color families overlap |
| size | 10 | Any preferred size matches listing size; auto-credit when no sizes selected |
| price | 10 | Within `[minPrice, maxPrice]` (with ±10% buffer when `allowCloseMatches`) |

**Brand is a hard gate, not a weighted field.** A listing whose normalized brand is not in the preference's brand list is immediately rejected.

**Hard gates** (always reject regardless of strictness): brand, condition floor, price range. With `allowCloseMatches` enabled, price uses a ±10% buffer before rejecting.

**Strict mode** (`onlyExactCriteria=true`): mismatches on **brand, model, color, size, condition, or price** are rejected outright. Style is intentionally excluded per spec.

**Match-type thresholds** (after gates pass):
- `exact` ≥ 95 *and* every requested criterion fully matched, no disqualifiers
- `strong` ≥ 80
- `close` ≥ 60
- `weak` ≥ 40 (not alert-eligible)
- `rejected` < 40 or any hard gate failed

`alertEligible = matchType ∈ {exact, strong, close}`.

**Plain-English explanations** are generated from the matched/unmatched fields, e.g. *"Strong match because this is a Hermès Evelyne PM, in Black, crossbody style, excellent condition, size PM."*

### Ingest integration (`artifacts/api-server/src/lib/ingest.ts`)

`loadPreferenceCriteria(preferenceId)` resolves a preference's brand/style/color/size junctions plus the condition floor and color families. The ingest pipeline then calls `evaluateMatch(...)` for every active preference per upserted listing. Only matches with `alertEligible=true` are persisted to `match_results`, and the engine's `explanation` is used as the alert's user-facing message. The `match_score` column stores the engine's 0–100 score divided by 100 (kept in numeric(4,3)) so existing frontend rendering (`Math.round(score*100)`) is unchanged.

### Tests (`artifacts/api-server/src/lib/matchEngine.test.ts`)

25 vitest cases covering exact / strong / close / weak / rejected paths, wrong brand, price too high, condition too low, close color (family) match, strict-mode rejections, ±10% price buffer, multi-brand preferences, and missing fields. Run with `pnpm --filter @workspace/api-server test`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Seed Data

- Reference tables (brands/styles/colors/sizes/conditions/sources) are seeded via SQL.
- Listings are populated by the live source adapters. On first startup `autoSeedIfEmpty` runs every adapter once; subsequent ingests run on the schedule wired up in `index.ts` or via the admin "Trigger ingest" button. To run with mock data instead (no network access), set `INGEST_USE_MOCK_ADAPTERS=true`.

## Design System

- **Palette**: Cream/ivory (`#f0ede6`) background, deep charcoal (`#2c2c2c`) text, dusty rose (`#b08b82`) accent
- **Typography**: Playfair Display (serif, headings), Plus Jakarta Sans (sans, body)
- **Style**: Editorial, luxury, unhurried — generous spacing, high typographic contrast

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
