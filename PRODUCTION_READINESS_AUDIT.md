# BagScout Production Readiness Audit

_Date: 2026-05-03 — completed against commit `2ac62bb` (post landing-page ship)._

---

## TL;DR

BagScout is in good shape architecturally. The audit found and fixed two real
production blockers (a missing migration and a default that would have triggered
live HTTP scraping in prod), expanded automated coverage from **120 → 150
tests across 13 files**, and surfaced one pre-existing TypeScript warning that
does not affect runtime.

| Area | Status | Notes |
|---|---|---|
| Migrations | ✅ Fixed | added `0004_users_is_admin.sql` + journal entry |
| Mock-only data policy | ✅ Fixed | `shouldUseMockAdapters()` now defaults to `true` |
| Auth + admin guard | ✅ Verified | now covered by `admin.test.ts` |
| Match engine | ✅ Strong | 30 unit tests across exact/strict/close/multi-brand |
| Ingest dedup + transitions | ✅ Strong | covered by `ingest.test.ts` |
| Saved listings | ✅ Verified | new `saved.test.ts` (8 tests, isolation + ordering) |
| Normalization | ✅ Verified | new `normalize.test.ts` (16 tests) |
| Adapters | ⚠️ One pre-existing TS warning in `therealreal.ts:165` (Cheerio typing) — runtime OK |
| Frontend UI | ✅ Untouched | landing page from prior task is intact |

Full test result: **150 pass / 0 fail / 13 files** (`pnpm --filter @workspace/api-server exec vitest run`).

---

## Issues found and fixed

### 1. Missing Drizzle migration for `users.is_admin` (CRITICAL — blocked all DB tests)

**Symptom**: 41 tests across 3 files failed with
`column "is_admin" of relation "users" does not exist`.

**Root cause**: The dev DB had been patched with a raw `ALTER TABLE` in a prior
session, but no Drizzle migration file existed. The vitest setup creates a
fresh per-worker database (`{base}_test_w{VITEST_POOL_ID}`) by `DROP/CREATE`
and then runs `runMigrations()` — so test DBs only ever saw the 0000–0003
files and were missing the `is_admin` column that `schema.ts` declared.

This would have blown up identically the first time the migration runner was
pointed at any environment that didn't already have the manual patch — including
production deploys.

**Fix**:
- New `lib/db/drizzle/0004_users_is_admin.sql`:
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;`
- New entry `idx: 4` in `lib/db/drizzle/meta/_journal.json`.

After the fix, all 13 test files pass cleanly.

### 2. Adapter default would scrape live websites in production (HIGH — policy violation)

**Symptom**: Although every row in `sources` has `ingestion_mode = 'mock'`,
the adapter wiring (`fashionphile.ts`, `rebag.ts`, `therealreal.ts`,
`yoogiscloset.ts`) only consults `INGEST_USE_MOCK_ADAPTERS` env var and
defaults the boolean to **`false`**. With the env unset (the production
default), a triggered ingest would call `httpFetch` against
`fashionphile.com`, `therealreal.com`, etc.

**Why this matters**: project policy is mock-only data — no third-party
scraping. The DB column suggests the intent was already mock-only, but the
runtime selector did not honour it.

**Fix**: `shouldUseMockAdapters()` in `artifacts/api-server/src/adapters/base.ts`
now defaults to `true`. To opt back into live HTTP adapters in dev, set
`INGEST_USE_MOCK_ADAPTERS=false` (or `0`). Existing behavior of
`INGEST_USE_MOCK_ADAPTERS=true|1` is preserved. No test changes were needed.

---

## New automated test coverage

Added **30 tests across 3 new files**, on top of the 120 already in place:

### `src/lib/normalize.test.ts` (16 tests)
- `normalizeText`: lower/trim/diacritic stripping, null handling.
- `normalizeBrand`: vendor variants → canonical (Hermès, YSL, LV, Christian
  Dior, Bottega), unknown-brand fallback.
- `normalizeColor`: direct alias maps, multi-word token matching, unknown-color
  fallback.
- `normalizeCondition` + `conditionRank`: alias coverage and best-to-worst
  rank ordering plus sentinel rank `99` for unknowns.
- `inferStyle`: keyword→style detection plus default fallback.
- `extractModel`: brand prefix stripping, stop-word filtering, ≤4-token cap.

### `src/routes/saved.test.ts` (8 tests)
- 401 on unauthenticated GET.
- POST creates saved row, returns expanded listing with numeric (not string)
  prices and source name.
- POST same listing twice → 409.
- POST invalid body → 400.
- DELETE invalid id → 400.
- DELETE only removes the current user's row, not another user's.
- GET only returns the current user's saves (data isolation).
- GET orders results by `createdAt DESC`.

### `src/routes/admin.test.ts` (6 tests)
- 401 unauthenticated, 403 for authenticated non-admin.
- DB-flagged admins (`users.is_admin = true`) pass.
- `ADMIN_USER_IDS` env allowlist passes.
- Substring-only allowlist match is **not** treated as admin.
- POST writes are blocked for non-admins (`/admin/ingest`).

### Existing coverage that was already strong

| File | Suites |
|---|---|
| `lib/matchEngine.test.ts` | 30+ tests covering exact, hard gates, close-color, strict mode, price buffer, multi-brand, edge cases |
| `lib/ingest.test.ts` | initial ingest, alert dedup cooldown (24h), price drop ≥5%, sub-threshold non-emit, unavailability dismissal, back-in-stock |
| `lib/alertEmail.test.ts` / `lib/digest.test.ts` | rendering + scheduling |
| `routes/preferences.test.ts` | full CRUD + suggestions, 19 tests |
| `adapters/http.test.ts` / `parse.test.ts` / `shopify.test.ts` / `yoogiscloset.test.ts` / `therealreal.test.ts` | adapter primitives & parsing |

---

## How to run

```bash
# All tests (api-server)
pnpm --filter @workspace/api-server exec vitest run

# Watch mode
pnpm --filter @workspace/api-server run test:watch

# Typecheck the whole workspace (libs + leaf packages)
pnpm run typecheck
```

The vitest setup (`src/test-utils/setup.ts`) automatically:
1. Reads `TEST_DATABASE_URL` (falls back to `DATABASE_URL`).
2. Creates a per-worker DB named `{baseDb}_test_w{VITEST_POOL_ID}` via the
   admin `postgres` DB.
3. Runs `runMigrations()` (now including `0004_users_is_admin`).
4. Seeds reference data via `seedReferenceData(workerUrl)`.
5. Mutates `process.env.DATABASE_URL` **before** `@workspace/db` is imported
   so the singleton pool picks up the per-worker URL.

`cleanupTestData()` in `beforeEach` truncates user-prefixed test data and the
test source's listings, leaving reference data intact.

## How to seed dev data

The dev DB already has reference rows. To trigger a mock ingest cycle for all
sources via the admin API:

```bash
curl -X POST http://localhost:80/api/admin/ingest-all \
  -H "Authorization: Bearer <clerk session token>"
```

…or run the script directly from the repo:

```bash
pnpm --filter @workspace/api-server exec tsx src/scripts/run-scheduled.ts
```

Both paths use the mock adapter set (now the default — see fix #2).

---

## Limitations / known issues

1. **Pre-existing TS warning in `src/adapters/therealreal.ts:165`** —
   `Cheerio<unknown>` vs `Cheerio<AnyNode>`. Does not break runtime
   (the JS works), but `pnpm --filter @workspace/api-server run typecheck`
   reports it. Fix is a one-line type assertion; left untouched to keep this
   audit's diff scoped.
2. **Admin route file is 1,157 lines.** Functional but worth splitting (sources,
   ingest, taxonomy, debug-match, digests) into separate routers when the next
   feature lands here.
3. **Drizzle journal `when` timestamps** are hand-incremented (`…0`,
   `…800`) rather than real epoch ms. Harmless because Drizzle migrate ordering
   is by `idx`, but if you ever run `drizzle-kit generate` it may want to
   rewrite the file.
4. **`INGEST_USE_MOCK_ADAPTERS` documentation** in `adapters/types.ts:13` and
   `adapters/fashionphile.ts:76` still describes the old "opt-in mock"
   behaviour. Comments are stale, code is now correct (mock is default).
5. **Live adapter code paths remain in the bundle.** They are dead code under
   the new default but are kept so `INGEST_USE_MOCK_ADAPTERS=false` still works
   for ad-hoc dev experiments.

## Suggested next-build items

1. Delete or convert the live HTTP adapter code paths into separate files /
   feature flag now that production is mock-only.
2. Split `routes/admin.ts` into per-area routers.
3. Add an end-to-end Playwright test for the watchlist creation flow against
   the running `bagscout` artifact (uses the testing skill).
4. Tighten the Cheerio typing in `therealreal.ts` (or annotate `// @ts-expect-error`
   with a justification) so `typecheck` returns clean.
5. Add a digest-rendering snapshot test so future template changes can't
   silently regress the email layout.
