import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// id is the Clerk user id (e.g. "user_2abc...") — Clerk is the identity source of truth.
// We mirror minimal profile here so we can reference users from other tables.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  fullName: text("full_name"),
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
