import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sourcesTable } from "./sources";

// job_type: manual | scheduled | backfill | scheduled_digest | scheduled_run
// status: running | success | partial | failed
//
// source_id is NULL for non-source-scoped rows (e.g. scheduled_digest, the
// overall scheduled_run summary). The original per-source ingest rows still
// always have source_id set.
export const ingestionLogsTable = pgTable("ingestion_logs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => sourcesTable.id, {
    onDelete: "cascade",
  }),
  jobType: text("job_type").notNull().default("manual"),
  status: text("status").notNull().default("running"),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsCreated: integer("records_created").notNull().default(0),
  recordsUpdated: integer("records_updated").notNull().default(0),
  errorMessage: text("error_message"),
  // Clerk user id of the admin who triggered this run, when applicable.
  // Null for scheduler-driven runs.
  actorUserId: text("actor_user_id"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type IngestionLog = typeof ingestionLogsTable.$inferSelect;
export type InsertIngestionLog = typeof ingestionLogsTable.$inferInsert;
