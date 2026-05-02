import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { conditionsTable } from "./conditions";

// A "dream bag profile" — the user's criteria for what they want.
// Multi-select fields (brands, styles, colors, sizes) live in junction tables.
export const bagPreferencesTable = pgTable("bag_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  // Free-text model query (e.g. "Birkin 30") used when exact_model_enabled = true
  exactModelEnabled: boolean("exact_model_enabled").notNull().default(false),
  modelQuery: text("model_query"),
  // Minimum acceptable condition (FK to conditions.id). Listings with rank > this are disqualified.
  conditionMinId: integer("condition_min_id").references(() => conditionsTable.id),
  allowCloseColorMatch: boolean("allow_close_color_match").notNull().default(true),
  minPrice: numeric("min_price", { precision: 10, scale: 2 }),
  maxPrice: numeric("max_price", { precision: 10, scale: 2 }),
  // If true, every selected criterion must match exactly (strict mode)
  onlyExactCriteria: boolean("only_exact_criteria").notNull().default(false),
  // If true, partial matches above the threshold still surface
  allowCloseMatches: boolean("allow_close_matches").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type BagPreference = typeof bagPreferencesTable.$inferSelect;
export type InsertBagPreference = typeof bagPreferencesTable.$inferInsert;
