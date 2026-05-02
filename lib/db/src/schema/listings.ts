import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sourcesTable } from "./sources";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sourcesTable.id),
  externalId: text("external_id").notNull(),
  brand: text("brand").notNull(),
  model: text("model"),
  style: text("style"),
  color: text("color"),
  size: text("size"),
  condition: text("condition").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  imageUrl: text("image_url"),
  listingUrl: text("listing_url").notNull(),
  description: text("description"),
  isAvailable: boolean("is_available").notNull().default(true),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
