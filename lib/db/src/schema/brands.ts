import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const brandsTable = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  // canonical lowercase name used for matching against listings
  normalizedName: text("normalized_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Brand = typeof brandsTable.$inferSelect;
export type InsertBrand = typeof brandsTable.$inferInsert;
