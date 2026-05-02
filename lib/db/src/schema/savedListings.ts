import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

export const savedListingsTable = pgTable(
  "saved_listings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listingsTable.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_listings_user_listing_idx").on(t.userId, t.listingId),
  ],
);

export type SavedListing = typeof savedListingsTable.$inferSelect;
export type InsertSavedListing = typeof savedListingsTable.$inferInsert;
