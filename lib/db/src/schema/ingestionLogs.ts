import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sourcesTable } from "./sources";

// job_type: scheduled | manual | backfill
// status: running | success | partial | failed
export const ingestionLogsTable = pgTable("ingestion_logs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sourcesTable.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull().default("manual"),
  status: text("status").notNull().default("running"),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsCreated: integer("records_created").notNull().default(0),
  recordsUpdated: integer("records_updated").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type IngestionLog = typeof ingestionLogsTable.$inferSelect;
export type InsertIngestionLog = typeof ingestionLogsTable.$inferInsert;
