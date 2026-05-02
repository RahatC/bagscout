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

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  adapterType: text("adapter_type").notNull().default("mock"),
  isActive: boolean("is_active").notNull().default(true),
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

export const insertSourceSchema = createInsertSchema(sourcesTable).omit({
  id: true,
  listingCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sourcesTable.$inferSelect;
