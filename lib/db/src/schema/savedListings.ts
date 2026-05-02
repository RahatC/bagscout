import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";

export const savedListingsTable = pgTable("saved_listings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id),
  notes: text("notes"),
  savedAt: timestamp("saved_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSavedListingSchema = createInsertSchema(
  savedListingsTable,
).omit({ id: true, savedAt: true });
export type InsertSavedListing = z.infer<typeof insertSavedListingSchema>;
export type SavedListing = typeof savedListingsTable.$inferSelect;
