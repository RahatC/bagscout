# Secret rotation

This is the runbook for rotating the three credentials BagScout depends on
without taking the API offline. All three follow the same shape:

1. Provision a new credential.
2. Stage it as an env var in Replit.
3. Cut traffic over.
4. Revoke the old credential.
5. Verify.

If anything looks off after a rotation, roll back by re-pasting the previous
value into the Replit secret and restarting the workflow — none of these are
write-once.

## `DATABASE_URL`

Used by `lib/db` (Drizzle pool) and the Drizzle migration runner that runs at
server startup.

1. In the Replit Database pane, snapshot the database (or take a `pg_dump`
   from a session with the current connection string).
2. Generate a new password for the database user; build the new connection
   string.
3. Open the API server's secrets pane and update `DATABASE_URL`. Workflows
   read env vars on start, so the new value won't take effect until restart.
4. Restart the `API Server` workflow. Verify:
   - `GET /api/healthz/deep` returns `{ status: "ok" }` with a low
     `database.latencyMs`.
   - The startup log line `Server listening` is followed by no migration
     errors.
5. Once the new connection is verified, revoke the old password.

For zero-downtime rotation when changing the database host (not just the
password), provision the new database, point `DATABASE_URL` at it, restart,
and only then decommission the old database. The migration runner is
idempotent so re-running against an already-migrated schema is safe.

## `CLERK_SECRET_KEY`

Used by `@clerk/express` middleware and by the Clerk frontend-API proxy
(`src/middlewares/clerkProxyMiddleware.ts`).

1. In the Auth pane (Workspace Toolbar → Auth) generate a new secret key for
   the same Clerk instance. Clerk supports two active secret keys at once,
   so the old key keeps working while you cut over.
2. Update the `CLERK_SECRET_KEY` secret in Replit.
3. Restart the `API Server` workflow.
4. Verify:
   - Sign in with an existing account in the deployed app — the session
     resumes without a re-prompt.
   - Hit any authenticated endpoint (e.g. `GET /api/preferences`) and
     confirm a 200, not 401.
5. Revoke the previous secret key in the Auth pane.

`CLERK_PUBLISHABLE_KEY` is not sensitive but if it changes (new instance,
not new secret) it must be rotated in lockstep with the frontend artifact's
publishable-key env var.

## `RESEND_API_KEY`

Used by `src/lib/mailClient.ts` for transactional email (alert digests).

1. In the Resend dashboard, create a new API key scoped to the same sending
   domain.
2. Update the `RESEND_API_KEY` secret in Replit.
3. Restart the `API Server` workflow.
4. Verify by triggering a dry-run digest:

   ```sh
   curl -X POST "$REPLIT_DEV_DOMAIN/api/admin/digests/run" \
     -H "Authorization: Bearer <admin-session>" \
     -H "Content-Type: application/json" \
     -d '{"dryRun": true}'
   ```

   You should get a `200` with a `DigestRunResult` body and no `aborted`
   field. If the new key is wrong the request will return `503` with an
   error referencing missing Resend creds.
5. Send a real digest run (without `dryRun`) and confirm at least one alert
   email arrives at a known test address.
6. Revoke the old API key in the Resend dashboard.

## After any rotation

- Glance at Sentry (if `SENTRY_DSN` is set) for any spike in 5xx or auth
  errors during the cutover window.
- Re-check the admin sources page (`/admin`) to confirm the `Source` health
  feed still updates and the most recent ingestion log row reports
  `status: success`.
