import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const bagStylesTable = pgTable("bag_styles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  normalizedName: text("normalized_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BagStyle = typeof bagStylesTable.$inferSelect;
export type InsertBagStyle = typeof bagStylesTable.$inferInsert;
