import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { bagPreferencesTable } from "./bagPreferences";
import { brandsTable } from "./brands";
import { bagStylesTable } from "./bagStyles";
import { colorsTable } from "./colors";
import { sizesTable } from "./sizes";

export const bagPreferenceBrandsTable = pgTable(
  "bag_preference_brands",
  {
    preferenceId: integer("preference_id")
      .notNull()
      .references(() => bagPreferencesTable.id, { onDelete: "cascade" }),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brandsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.preferenceId, t.brandId] })],
);

export const bagPreferenceStylesTable = pgTable(
  "bag_preference_styles",
  {
    preferenceId: integer("preference_id")
      .notNull()
      .references(() => bagPreferencesTable.id, { onDelete: "cascade" }),
    styleId: integer("style_id")
      .notNull()
      .references(() => bagStylesTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.preferenceId, t.styleId] })],
);

export const bagPreferenceColorsTable = pgTable(
  "bag_preference_colors",
  {
    preferenceId: integer("preference_id")
      .notNull()
      .references(() => bagPreferencesTable.id, { onDelete: "cascade" }),
    colorId: integer("color_id")
      .notNull()
      .references(() => colorsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.preferenceId, t.colorId] })],
);

export const bagPreferenceSizesTable = pgTable(
  "bag_preference_sizes",
  {
    preferenceId: integer("preference_id")
      .notNull()
      .references(() => bagPreferencesTable.id, { onDelete: "cascade" }),
    sizeId: integer("size_id")
      .notNull()
      .references(() => sizesTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.preferenceId, t.sizeId] })],
);
