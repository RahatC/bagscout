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

export const watchlistsTable = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  model: text("model"),
  style: text("style"),
  color: text("color"),
  size: text("size"),
  condition: text("condition"),
  minPrice: numeric("min_price", { precision: 10, scale: 2 }),
  maxPrice: numeric("max_price", { precision: 10, scale: 2 }),
  matchType: text("match_type").notNull().default("close"),
  isActive: boolean("is_active").notNull().default(true),
  matchCount: integer("match_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertWatchlistSchema = createInsertSchema(watchlistsTable).omit({
  id: true,
  matchCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistsTable.$inferSelect;
