import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// rank is the ordinal — lower = better (1 = New with Tags, 6 = Fair).
// Used for "condition_min" comparisons.
export const conditionsTable = pgTable("conditions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  normalizedName: text("normalized_name").notNull(),
  rank: integer("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Condition = typeof conditionsTable.$inferSelect;
export type InsertCondition = typeof conditionsTable.$inferInsert;
