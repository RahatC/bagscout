import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const sizesTable = pgTable("sizes", {
  id: serial("id").primaryKey(),
  // Display label like "Mini", "Small", "Medium", "Birkin 30"
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  normalizedName: text("normalized_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Size = typeof sizesTable.$inferSelect;
export type InsertSize = typeof sizesTable.$inferInsert;
