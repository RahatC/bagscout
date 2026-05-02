import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const colorsTable = pgTable("colors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  normalizedName: text("normalized_name").notNull(),
  // family allows "close color match" — e.g. Tan, Beige, Cream all in "neutrals"
  family: text("family").notNull().default("other"),
  hex: text("hex"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Color = typeof colorsTable.$inferSelect;
export type InsertColor = typeof colorsTable.$inferInsert;
