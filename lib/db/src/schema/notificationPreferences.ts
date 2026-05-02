import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// channel: in_app | email | push | sms
export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  alertType: text("alert_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // quiet_hours stored as "HH:MM-HH:MM" in user's locale; nullable
  quietHours: text("quiet_hours"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferencesTable.$inferInsert;
