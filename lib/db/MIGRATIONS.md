# Database Migrations

This package owns the Postgres schema and its versioned migrations.

## Layout

- `src/schema/` — Drizzle schema (the source of truth).
- `drizzle/` — Generated SQL migrations and journal. **Commit these.**
- `drizzle.config.ts` — Drizzle Kit config (schema in, `drizzle/` out).
- `src/migrate.ts` — Migration runner used at deploy / startup time.

## Commands

Run from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm --filter @workspace/db run generate -- --name <name>` | Diff schema vs the journal and write a new SQL migration. |
| `pnpm --filter @workspace/db run migrate` | Apply all pending migrations against `DATABASE_URL`. Idempotent. |
| `pnpm --filter @workspace/db run check` | Sanity-check the migration journal for conflicts. |
| `pnpm --filter @workspace/db run push` | Dev-only: stamp the schema into a database without writing a migration. Use sparingly. |

## Adding a new migration

1. Edit a file in `lib/db/src/schema/`.
2. Generate the migration:
   ```sh
   pnpm --filter @workspace/db run generate -- --name add_widget_table
   ```
3. **Review the SQL** in `lib/db/drizzle/<n>_add_widget_table.sql`. Hand-edit if Drizzle picked something unsafe (renames, drops, defaults on NOT NULL columns, etc.).
4. Apply it locally to confirm it runs cleanly:
   ```sh
   pnpm --filter @workspace/db run migrate
   ```
5. Commit `drizzle/<n>_*.sql` and the updated `drizzle/meta/*` files alongside the schema change.

## Bringing an existing dev database up to date

Just run:

```sh
pnpm --filter @workspace/db run migrate
```

The runner is safe to invoke multiple times. The first time it runs against a database that was previously initialized with `drizzle-kit push`, it detects the existing schema and stamps the baseline migration as already applied, then continues with any newer migrations.

## Production / deploy

The api-server runs `runMigrations()` from `@workspace/db` during startup, before `app.listen()`. The api-server build copies `lib/db/drizzle/` into `artifacts/api-server/dist/drizzle/` so the SQL files are available next to the bundled entry point.

If migrations fail, the server exits non-zero and the deploy is rolled back by the platform — production never serves traffic against an out-of-date schema.
