import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// id is the Clerk user id (e.g. "user_2abc...") — Clerk is the identity source of truth.
// We mirror minimal profile here so we can reference users from other tables.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  fullName: text("full_name"),
  // Admin flag — granted manually (or via DB step in tests). Checked by
  // `requireAdmin` middleware in addition to ADMIN_USER_IDS env and Clerk
  // publicMetadata.role === "admin".
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
