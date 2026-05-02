import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";
import { watchlistsTable } from "./watchlists";
import { listingsTable } from "./listings";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  matchId: integer("match_id").references(() => matchesTable.id),
  watchlistId: integer("watchlist_id").references(() => watchlistsTable.id),
  listingId: integer("listing_id").references(() => listingsTable.id),
  type: text("type").notNull().default("new_match"),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
