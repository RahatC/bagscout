import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { bagPreferencesTable } from "./bagPreferences";
import { listingsTable } from "./listings";

// match_type: exact | close
// match_reasons: [{ field: "brand", value: "Hermès", matched: true, weight: 0.3 }, ...]
// disqualifiers: [{ field: "condition", value: "Fair", reason: "below minimum" }, ...]
export const matchResultsTable = pgTable(
  "match_results",
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
    matchScore: numeric("match_score", { precision: 4, scale: 3 }).notNull(),
    matchType: text("match_type").notNull().default("close"),
    matchReasons: jsonb("match_reasons").$type<MatchReason[]>().notNull().default([]),
    disqualifiers: jsonb("disqualifiers").$type<Disqualifier[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("match_results_pref_listing_idx").on(t.preferenceId, t.listingId),
  ],
);

export type MatchReason = {
  field: string;
  value: string;
  matched: boolean;
  weight: number;
  detail?: string;
};

export type Disqualifier = {
  field: string;
  value: string;
  reason: string;
};

export type MatchResult = typeof matchResultsTable.$inferSelect;
export type InsertMatchResult = typeof matchResultsTable.$inferInsert;
