import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { bagPreferencesTable } from "./bagPreferences";
import { listingsTable } from "./listings";
import { matchResultsTable } from "./matchResults";

// alert_type: new_match | price_drop | back_in_stock
// status: pending | sent | read | dismissed
export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  preferenceId: integer("preference_id")
    .notNull()
    .references(() => bagPreferencesTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  matchResultId: integer("match_result_id").references(() => matchResultsTable.id, {
    onDelete: "set null",
  }),
  alertType: text("alert_type").notNull(),
  status: text("status").notNull().default("pending"),
  message: text("message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Alert = typeof alertsTable.$inferSelect;
export type InsertAlert = typeof alertsTable.$inferInsert;
