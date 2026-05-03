# BagScout

## Overview

BagScout is a premium web application designed for luxury bag enthusiasts. It allows users to create detailed "watchlists" specifying their desired bags by brand, style, color, size, condition, and price range. The application then ingests listings from various resale marketplaces, employs a weighted matching engine to identify relevant bags, and notifies users of new matches or price drops. The project's vision is to become the go-to platform for discovering luxury resale bags, offering a personalized and efficient tracking experience.

## User Preferences

No specific user preferences were provided in the original `replit.md` file. The agent should infer preferences from the project's goals and structure, such as prioritizing modularity and maintainability due to the monorepo setup, and adhering to established design patterns for a consistent user experience.

## System Architecture

BagScout is built as a pnpm workspace monorepo utilizing TypeScript.

**Core Technologies:**
- **Frontend**: React with Vite, Tailwind CSS, shadcn/ui, Framer Motion for animations, and Wouter for routing.
- **Backend**: Express 5 API server.
- **Authentication**: Clerk for user management, with a custom appearance and API proxy.
- **Database**: PostgreSQL with Drizzle ORM for schema definition and interaction.
- **Validation**: Zod for schema validation.
- **API Definition**: OpenAPI specification for API design, with Orval generating API client and Zod schemas.

**Monorepo Structure:**
- `bagscout`: React + Vite frontend artifact.
- `api-server`: Express API server artifact.
- `lib/api-spec`: Contains OpenAPI specification and Orval configuration.
- `lib/api-zod`: Generated Zod schemas from the OpenAPI spec.
- `lib/api-client-react`: Generated React Query hooks for API interaction.
- `lib/db`: Drizzle ORM schemas and database client.

**Database Schema Highlights:**
- **Reference Data**: `brands`, `bag_styles`, `colors`, `sizes`, `conditions`, `sources`.
- **User Data**: `users` (Clerk ID mirrored), `user_profiles`, `notification_preferences`.
- **Core Features**: `bag_preferences` (user watchlists), `bag_preference_brands`, `bag_preference_styles`, `bag_preference_colors`, `bag_preference_sizes` (junction tables for preferences), `listings`, `listing_snapshots` (price/availability history), `match_results`, `alerts`, `saved_listings`, `ingestion_logs`.

**API Routes:**
- **Public**: `reference` (brands, styles, etc.), `listings` (browse, featured).
- **Authenticated**: `preferences` (CRUD, matches), `matches` (user's results), `alerts` (list, mark read), `saved` (save/unsave/list), `dashboard` (summary, recent matches).
- **Admin**: `admin` (sources health, ingestion logs, trigger ingest, listing explorer with filters, match-engine debugger, taxonomy CRUD for brands/colors/conditions/sizes/styles/models).

**Middleware:**
- `requireAuth`: Handles Clerk authentication and lazy upsert of local user data.
- `requireAdmin`: Enforces admin access via any of: `ADMIN_USER_IDS` env var, `users.is_admin` DB column, or Clerk `publicMetadata.role === "admin"`.

**Frontend Pages:**
- **Public/Auth**: `/` (landing/dashboard), `/sign-in`, `/sign-up`, `/onboarding` (first-time user flow).
- **Authenticated**: `/dashboard`, `/watchlists` (list, new, detail), `/listings` (browse, detail), `/alerts`, `/saved`.
- **Admin**: `/admin` — top-level tabs for System Status, Listing Explorer, Match Debugger, and Taxonomy Manager.

**Listing Ingestion System:**
- Implements a `SourceAdapter` interface for fetching, normalizing, and validating listings from various sources.
- Uses `httpFetch` with retries and rate limiting for robust external API calls.
- `normalize.ts` module provides helpers for standardizing brand, color, condition, style, and model names.
- The `ingest.ts` engine orchestrates fetching, processing, and persisting listings, including matching against user preferences.
- Scheduled ingestion and digest processes are managed by `scheduler.ts` and `digest.ts`, utilizing advisory locks for overlap protection.

**Matching Engine:**
- A pure function `evaluateMatch(preference, listing)` calculates a `matchScore` (0-100) and `matchType` (`exact`, `strong`, `close`, `weak`, `rejected`).
- Features weighted fields (model, style, condition, color, size, price) and hard gates (brand, condition floor, price range) for rejection.
- Supports a "strict mode" (`onlyExactCriteria`) for higher precision matching.
- Generates plain-English explanations for match results.

**Design System:**
- **Palette**: Cream/ivory background, deep charcoal text, dusty rose accent.
- **Typography**: Playfair Display (serif for headings), Plus Jakarta Sans (sans-serif for body).
- **Aesthetics**: Editorial, luxury, unhurried, with generous spacing and high typographic contrast.

## External Dependencies

- **Authentication**: Clerk
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **API Specification**: OpenAPI
- **API Client Generation**: Orval
- **Frontend Framework**: React
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Routing**: Wouter
- **Validation**: Zod
- **Node.js Framework**: Express
- **Package Manager**: pnpm
- **Build Tool**: Vite, esbuild
- **Testing Framework**: Vitest (used for `matchEngine.test.ts`)
- **Web Scraping/Parsing**: cheerio (for Yoogi's Closet HTML parsing)
- **Email/Notification Service**: Resend (implied by `Resend confirms a message id` in digest section)