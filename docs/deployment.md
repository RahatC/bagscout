# BagScout — Deployment & Environment Setup

This doc captures everything needed to publish BagScout on Replit Autoscale.
No secret values are recorded here — only the names of the variables and how
each is provisioned.

## 1. Required environment variables and secrets

Set or check these in **Tools → Secrets** before publishing.

### Database (Replit-managed)

| Name           | Where  | Notes                                                                                          |
| -------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Secret | Provisioned by the Replit Postgres add-on. Do not edit by hand.                                 |
| `PG*` family   | Secret | `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — also Replit-managed.                |

The API server runs Drizzle migrations on startup
(`runMigrations` in `artifacts/api-server/src/index.ts`), so the prod DB only
needs to exist and be reachable — no manual migration step.

### Clerk Auth (Replit-managed)

This project uses **Replit-managed Clerk Auth** (status: `managed`). Replit
provisions both a development and a production Clerk tenant for you and
**automatically swaps the keys at publish time**:

- In development, `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` hold the
  `pk_test_…` / `sk_test_…` values.
- In the published app, the same secret names hold the `pk_live_…` / `sk_live_…`
  values for the production Clerk tenant.

| Name                          | Where  | Notes                                                                                                                                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLERK_PUBLISHABLE_KEY`       | Secret | Auto-managed by Replit. Used by the API server's Clerk middleware and bridged into the Vite client bundle (see Section 2). **Do not edit manually.**    |
| `CLERK_SECRET_KEY`            | Secret | Auto-managed by Replit. Used by the API server and the `/api/__clerk` proxy. **Do not edit manually.**                                                 |
| `VITE_CLERK_PUBLISHABLE_KEY`  | —      | **Do not set.** Previously a manual override; now derived from `CLERK_PUBLISHABLE_KEY` inside `artifacts/bagscout/vite.config.ts` so auto-swap works.   |
| `VITE_CLERK_PROXY_URL`        | env    | Optional. Leave unset to use the same-origin `/api/__clerk` proxy. Set only if a CDN in front of BagScout requires an absolute URL.                    |

You can confirm the live key after publishing under
**Publishing → Overview → Adjust settings**.

### Admin

| Name             | Where               | Notes                                                                                                          |
| ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ADMIN_USER_IDS` | env, **production** | Comma-separated Clerk user ids that get access to `/admin` and `POST /api/admin/ingest`. Sign in to the published app once, copy your prod-tenant Clerk user id from the Auth pane, and set this. Alternative: set `publicMetadata.role = "admin"` on the Clerk user (also via the Auth pane). |

### Email (required for digest/alert delivery)

Credentials are resolved in priority order: **(1) plain env vars**, then
**(2) the Replit Resend connector**. Use the env vars for any non-Replit host
(Docker, VPS, CI); the connector is the zero-config path on Replit.

| Name                | Where  | Notes                                                                                                          |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`    | Secret | Resend API key. When set together with `RESEND_FROM_EMAIL`, used directly (host-agnostic).                     |
| `RESEND_FROM_EMAIL` | Secret | Verified Resend sender (alias: `RESEND_FROM`). Required alongside `RESEND_API_KEY`.                            |
| Replit Resend connector | Integration | Fallback when the two env vars above are absent. Requires `REPLIT_CONNECTORS_HOSTNAME` + `REPL_IDENTITY`. |

If neither source is configured, the digest run aborts cleanly (alerts stay
`pending` and are retried on the next run) — it never crashes the server.

### Scheduler tuning (optional)

The API server runs an in-process scheduler. Defaults are sensible; only set
these to override.

| Name                       | Default | Notes                                                                                            |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `SCHEDULER_ENABLED`        | `true`  | Set to `false` if you move ingestion to a separate Replit Scheduled Deployment.                  |
| `INGEST_INTERVAL_MINUTES`  | `5`     | Scheduler *tick* interval. Each source then runs only if its own `cadence_minutes` has elapsed.   |
| `DIGEST_INTERVAL_MINUTES`  | `30`    | How often the digest worker checks for due daily/weekly alerts.                                   |
| `INGEST_USE_MOCK_ADAPTERS` | unset (= mock) | **Mock-only is the default.** When unset/`true`, every source uses its mock adapter regardless of the source's DB `ingestion_mode` — no live HTTP requests to third-party retailers. Set to `false` to allow live ingestion for sources whose DB row is `ingestion_mode = 'live'` (eBay/FASHIONPHILE/Rebag). Leave unset in production unless live ingestion has been explicitly reviewed for compliance. |
| `LOG_LEVEL`                | `info`  | `pino` log level for the API server.                                                              |
| `PUBLIC_APP_ORIGIN`        | unset   | Optional override used by the email digest to build absolute links.                               |

### Runtime-managed (do not edit)

`REPL_ID`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `SESSION_SECRET`,
`REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL` — Replit
sets these automatically.

## 2. How the Clerk key auto-swap reaches the browser

The Vite client bundle reads `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`
(see `artifacts/bagscout/src/App.tsx`). Vite only exposes env vars prefixed
with `VITE_`, but Replit's auto-swap only applies to `CLERK_PUBLISHABLE_KEY`.
To bridge the two, `artifacts/bagscout/vite.config.ts` does:

```ts
if (
  !process.env.VITE_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_PUBLISHABLE_KEY
) {
  process.env.VITE_CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
}
```

Effect: the browser bundle picks up the `pk_test_…` key in dev and the
`pk_live_…` key in prod automatically, with no manual key copying. The
"Clerk has been loaded with development keys" warning therefore disappears
on the published app without any code change.

If you ever need to point at an external Clerk tenant (not Replit-managed),
set `VITE_CLERK_PUBLISHABLE_KEY` explicitly — the explicit value always wins.

## 3. Deployment configuration

Both artifacts are already configured for **Replit Autoscale**. The relevant
files (do **not** edit directly — use `verifyAndReplaceArtifactToml`):

- `artifacts/api-server/.replit-artifact/artifact.toml`
  - Build: `pnpm --filter @workspace/api-server run build` with `NODE_ENV=production`.
  - Run: `node --enable-source-maps artifacts/api-server/dist/index.mjs` on `PORT=8080`.
  - Health check: `GET /api/healthz` (route lives in `artifacts/api-server/src/routes/health.ts`).
  - Mounted at `/api` via the global proxy.

- `artifacts/bagscout/.replit-artifact/artifact.toml`
  - Build: `pnpm --filter @workspace/bagscout run build`.
  - Serve mode: `static`, `publicDir = artifacts/bagscout/dist/public`.
  - SPA rewrite: `/*` → `/index.html`.
  - Mounted at `/`.

The proxy routes `/api/*` to the API server and everything else to the static
web bundle, so the same `https://<repl>.replit.app` URL serves both — no extra
CORS configuration is needed beyond the existing
`cors({ origin: true, credentials: true })` in `artifacts/api-server/src/app.ts`.

The Clerk Frontend API is reverse-proxied through `/api/__clerk` by
`artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`, which only
activates when `NODE_ENV=production`. This is what lets Clerk work on the
`*.replit.app` domain without any DNS / CNAME work.

## 3a. Background jobs in production (IMPORTANT)

The API server runs an **in-process scheduler** (`setInterval`, `.unref()`'d)
for ingest + digest. On **Autoscale**, instances are spun up per-request and
suspended when idle, so the in-process timers are **not a reliable trigger** —
ticks may not fire when there is no live traffic. Treat the in-process
scheduler as a best-effort convenience for always-warm deployments only.

**Recommended production setup (decoupled jobs):**

1. Set `SCHEDULER_ENABLED=false` on the API server (stops the unreliable
   in-process timers).
2. Create a **Replit Scheduled Deployment** (or any external cron) that runs
   the one-shot entry-point on a fixed cadence (every 30–60 min):

   ```bash
   pnpm --filter @workspace/api-server run build
   node artifacts/api-server/dist/run-scheduled.mjs
   ```

   `src/scripts/run-scheduled.ts` applies migrations, then runs one ingest
   cycle and one digest cycle and exits. It shares the same Postgres advisory
   locks as the in-process scheduler, so it is safe to run even if a warm API
   server is also ticking — neither double-fires.

Until a scheduled/cron trigger is configured, alerts will only be generated
and emailed while the API server happens to be warm. This is a deployment
configuration step (it cannot be guaranteed from application code on
Autoscale).

## 4. Publish (user action)

Task agents cannot trigger a publish. From the main workspace:

1. Open **Publish** in the workspace toolbar.
2. Confirm the deployment type is **Autoscale** for both artifacts.
3. (First publish only) Pick a publishing geography — this choice is
   permanent.
4. Click **Publish**. Replit handles the build, TLS, health checks, and the
   Clerk dev→live key swap automatically.

After the first successful publish, the production URL is visible under
**Publishing → Overview** and via `getDeploymentInfo()`.

## 5. Smoke test on the deployed URL

Once the deploy is live:

1. Open `https://<repl>.replit.app/` in a private window. The landing page
   should render and the browser console should show **no** "development keys"
   warning from Clerk.
2. Sign up with a fresh email; complete onboarding. The `users` row is
   lazy-upserted on the first authenticated request.
3. Create a watchlist via `/watchlists/new`. Confirm it appears on
   `/watchlists` and `/dashboard`.
4. Browse `/listings` and open a detail page.
5. Sign in as an admin user (one of the ids in `ADMIN_USER_IDS`), open
   `/admin`, and click **Trigger ingest**. Watch `ingestion_logs` for a
   `success` row per source.
6. Check the Network tab: every `/api/*` call should return 2xx, and Clerk's
   `/api/__clerk/*` calls should return 2xx with no CORS errors.

## 6. Re-deploying after schema or code changes

- **Schema changes**: edit a Drizzle schema in `lib/db/src/schema/`, then run
  `pnpm --filter @workspace/db run db:generate` to produce a new migration.
  Commit the generated `lib/db/drizzle/*.sql` file. The next deploy applies it
  on startup automatically.
- **API contract changes**: edit `lib/api-spec/openapi.yaml`, then run
  `pnpm --filter @workspace/api-spec run codegen` and commit the regenerated
  `lib/api-zod` and `lib/api-client-react` outputs.
- **Env-var changes**: update Secrets / env vars **before** clicking Publish —
  the web bundle bakes its env values at build time.
- **Routine code changes**: just click **Publish** again from the main
  workspace; Replit rebuilds both artifacts and swaps the active revision.
