import { runMigrations } from "../migrate";

runMigrations().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[db:migrate] migration failed:", err);
  process.exit(1);
});
