import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { bagPreferencesTable } from "./bagPreferences";
import { listingsTable } from "./listings";
import { matchResultsTable } from "./matchResults";

// alert_type:
//   new_match | price_drop | back_in_stock | better_condition |
//   exact_model | under_target_price
// status: pending | sent | read | dismissed
export const alertsTable = pgTable(
  "alerts",
  {
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
    // Short urgency line shown to the user ("Price dropped 12%", "Newly listed", ...)
    whyNow: text("why_now"),
    // Snapshot of listing facts at the moment the alert was created — used to
    // decide whether a follow-up alert represents a "material change".
    priceAtAlert: numeric("price_at_alert", { precision: 10, scale: 2 }),
    conditionRankAtAlert: integer("condition_rank_at_alert"),
    availabilityAtAlert: text("availability_at_alert"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    digestSentAt: timestamp("digest_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Speed up dedup lookup: "most recent alert for (user, listing, type)".
    index("alerts_user_listing_type_idx").on(
      t.userId,
      t.listingId,
      t.alertType,
      t.createdAt,
    ),
  ],
);

export type Alert = typeof alertsTable.$inferSelect;
export type InsertAlert = typeof alertsTable.$inferInsert;
