import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";

// Append-only history. One row each time we observe the listing.
// Enables price-drop detection and back-in-stock alerts.
export const listingSnapshotsTable = pgTable("listing_snapshots", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  availabilityStatus: text("availability_status").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ListingSnapshot = typeof listingSnapshotsTable.$inferSelect;
export type InsertListingSnapshot = typeof listingSnapshotsTable.$inferInsert;
