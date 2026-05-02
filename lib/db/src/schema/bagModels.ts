import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { brandsTable } from "./brands";

export const bagModelsTable = pgTable(
  "bag_models",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brandsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("bag_models_brand_name_idx").on(t.brandId, t.normalizedName)],
);

export type BagModel = typeof bagModelsTable.$inferSelect;
export type InsertBagModel = typeof bagModelsTable.$inferInsert;
