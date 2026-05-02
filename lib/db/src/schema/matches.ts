import {
  pgTable,
  serial,
  timestamp,
  boolean,
  numeric,
  integer,
  text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { watchlistsTable } from "./watchlists";
import { listingsTable } from "./listings";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  watchlistId: integer("watchlist_id")
    .notNull()
    .references(() => watchlistsTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id),
  score: numeric("score", { precision: 5, scale: 4 }).notNull(),
  matchReasons: text("match_reasons").array().notNull().default([]),
  isNew: boolean("is_new").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
