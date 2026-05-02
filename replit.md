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
- `bag_preferences` — nickname, modelQuery + exactModelEnabled, conditionMinId, allowCloseColorMatch, minPrice/maxPrice, allowCloseMatches, onlyExactCriteria, active
- Junctions: `bag_preference_brands`, `bag_preference_styles`, `bag_preference_colors`, `bag_preference_sizes`
- `listings` — raw + `normalized_*` fields (brand, model, style, color, condition); `availability_status`; `source_id` FK
- `listing_snapshots` — append-only price/availability history
- `match_results` — `(preferenceId, listingId)` unique; `matchScore`, `matchType`, `matchReasons[]`, `disqualifiers[]`
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

`adapters/base.ts` provides a `createMockAdapter` factory plus default normalize + validate implementations. The 4 mock adapters (`fashionphile.ts`, `rebag.ts`, `therealreal.ts`, `yoogiscloset.ts`) each ship 20 realistic luxury bag listings (80 total) and are registered in `adapters/index.ts`.

**No scraping, no terms violations.** The mock adapters return hand-curated sample data. Production adapters can later use approved channels: official APIs, affiliate feeds, sitemaps where allowed, merchant-provided feeds, user-submitted watch URLs, or email/newsletter parsing.

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

## Matching Engine (`artifacts/api-server/src/lib/ingest.ts`)

Each ingest run upserts listings (with `normalized_*` fields), appends a `listing_snapshots` row, then scores every active preference against the new listing. Weighted scoring:

| Field | Weight | Notes |
|---|---|---|
| brand | 0.28 | **Must match** any preferred brand, otherwise score 0 |
| model | 0.18 | Free-text contains check on title+model when `exactModelEnabled` |
| style | 0.10 | Any preferred style matches `normalized_style` |
| color | 0.13 | Exact match, or 50% credit if `allowCloseColorMatch` and listing color's family matches a preferred color's family |
| size | 0.08 | Any preferred size matches listing size |
| condition | 0.10 | Listing condition rank ≤ preference floor |
| price | 0.13 | Within `[minPrice, maxPrice]` |

Threshold to materialize a match: `0.99` if `onlyExactCriteria`, `0.65` if `allowCloseMatches`, else `0.85`. Each match also auto-creates an `alert` (alertType `new_match`, status `pending`) if none exists for that listing/user.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Seed Data

- Reference tables (brands/styles/colors/sizes/conditions/sources) are seeded via SQL.
- Listings are NOT pre-seeded. Trigger `/admin` ingest to populate them from the mock data baked into `artifacts/api-server/src/lib/ingest.ts`.

## Design System

- **Palette**: Cream/ivory (`#f0ede6`) background, deep charcoal (`#2c2c2c`) text, dusty rose (`#b08b82`) accent
- **Typography**: Playfair Display (serif, headings), Plus Jakarta Sans (sans, body)
- **Style**: Editorial, luxury, unhurried — generous spacing, high typographic contrast

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
