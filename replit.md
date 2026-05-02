# BagScout

## Overview

BagScout is a premium luxury bag resale alert web app. Users create watchlists for desired bags (brand, model, style, color, size, condition, price range, match type), the app matches listings from mock resale marketplaces against watchlists, and alerts users on matches.

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
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
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
- `watchlists` — User watchlists with bag criteria (brand, model, style, color, size, condition, price range, matchType)
- `sources` — Resale marketplace sources (FASHIONPHILE, Rebag, The RealReal, Yoogi's Closet)
- `listings` — Bag listings from sources
- `matches` — Matches between watchlists and listings with score + reasons
- `alerts` — User alerts for new matches, price drops, back-in-stock
- `savedListings` — User-saved listings

### API Routes (`artifacts/api-server/src/routes/`)
- `watchlists.ts` — CRUD watchlists + GET /:id/matches
- `listings.ts` — Browse listings + GET /featured (no auth required)
- `matches.ts` — GET /matches (all user matches)
- `alerts.ts` — List/mark-read alerts
- `saved.ts` — Save/unsave listings
- `dashboard.ts` — GET /summary, /recent-matches, /price-drops
- `admin.ts` — GET /sources, POST /ingest

### Frontend Pages (`artifacts/bagscout/src/pages/`)
- `/` — Landing page (unauthenticated) / redirects to dashboard when signed in
- `/sign-in`, `/sign-up` — Clerk auth pages (fully branded)
- `/onboarding` — First-time watchlist creation
- `/dashboard` — Stats + recent matches + price drops
- `/watchlists` — Watchlist list, `/watchlists/new`, `/watchlists/:id`
- `/listings` — Browse all listings with filters, `/listings/:id`
- `/alerts` — Alert feed with mark-read
- `/saved` — Saved listings
- `/admin` — Source health + manual ingest trigger

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Seed Data

Sources are seeded via SQL. Listings are seeded via `artifacts/api-server/src/lib/ingest.ts` (mock ingest helper). Run admin ingest to populate listings.

## Design System

- **Palette**: Cream/ivory (`#f0ede6`) background, deep charcoal (`#2c2c2c`) text, dusty rose (`#b08b82`) accent
- **Typography**: Playfair Display (serif, headings), Plus Jakarta Sans (sans, body)
- **Style**: Editorial, luxury, unhurried — generous spacing, high typographic contrast

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
