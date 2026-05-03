import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

// source_type: official_partner | resale_marketplace | auction_house
// ingestion_mode: mock | rss | sitemap | api | email
// compliance_status: approved | pending_review | restricted
export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  sourceType: text("source_type").notNull().default("resale_marketplace"),
  ingestionMode: text("ingestion_mode").notNull().default("mock"),
  complianceStatus: text("compliance_status").notNull().default("approved"),
  active: boolean("active").notNull().default(true),
  // Polling cadence in minutes. The scheduler reads this per source so some
  // marketplaces (high-velocity resale feeds) can be polled more frequently
  // than others (slower-moving auction houses). Default 60 min.
  cadenceMinutes: integer("cadence_minutes").notNull().default(60),
  lastIngestAt: timestamp("last_ingest_at", { withTimezone: true }),
  listingCount: integer("listing_count").notNull().default(0),
  status: text("status").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Source = typeof sourcesTable.$inferSelect;
export type InsertSource = typeof sourcesTable.$inferInsert;
