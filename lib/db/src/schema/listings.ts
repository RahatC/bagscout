import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sourcesTable } from "./sources";

// availability_status: available | sold | reserved | unknown
// scarcity_tier: common | uncommon | rare | very_rare
// price_verdict: below | fair | expensive (vs market range)
export const listingsTable = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sourcesTable.id),
    sourceListingId: text("source_listing_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    // Raw values as scraped/received
    brand: text("brand").notNull(),
    model: text("model"),
    style: text("style"),
    condition: text("condition"),
    color: text("color"),
    size: text("size"),
    // Normalized lowercase forms used by the matching engine
    normalizedBrand: text("normalized_brand").notNull(),
    normalizedModel: text("normalized_model"),
    normalizedStyle: text("normalized_style"),
    normalizedCondition: text("normalized_condition"),
    normalizedColor: text("normalized_color"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
    imageUrl: text("image_url"),
    description: text("description"),
    availabilityStatus: text("availability_status").notNull().default("available"),
    // Computed intelligence fields, refreshed on every snapshot.
    dealScore: numeric("deal_score", { precision: 4, scale: 1 }),
    marketLow: numeric("market_low", { precision: 10, scale: 2 }),
    marketMedian: numeric("market_median", { precision: 10, scale: 2 }),
    marketHigh: numeric("market_high", { precision: 10, scale: 2 }),
    marketSampleSize: integer("market_sample_size"),
    scarcityTier: text("scarcity_tier"),
    priceVerdict: text("price_verdict"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("listings_source_external_idx").on(t.sourceId, t.sourceListingId),
  ],
);

export type Listing = typeof listingsTable.$inferSelect;
export type InsertListing = typeof listingsTable.$inferInsert;
