import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Requires Clerk authentication AND ensures a row exists in our local
 * `users` table for this Clerk user (lazy upsert on first authenticated request).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Lazy-upsert local users row
  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (existing.length === 0) {
      let email: string | null = null;
      let fullName: string | null = null;
      try {
        const user = await clerkClient.users.getUser(userId);
        email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
        fullName =
          [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
      } catch {
        // Clerk lookup failure is non-fatal — we still record the user id.
      }

      await db
        .insert(usersTable)
        .values({ id: userId, email, fullName })
        .onConflictDoNothing();
    }
  } catch (err) {
    req.log?.error({ err, userId }, "Failed to upsert user");
  }

  (req as Request & { userId: string }).userId = userId;
  next();
}

/**
 * Requires the authenticated user to be in the admin allowlist.
 * Admin users are identified by Clerk user id present in the
 * comma-separated `ADMIN_USER_IDS` env var, OR by Clerk
 * `publicMetadata.role === "admin"`.
 *
 * Must be chained AFTER `requireAuth`.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const allowlist = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowlist.includes(userId)) {
    next();
    return;
  }

  // Fall back to Clerk publicMetadata.role
  try {
    const user = await clerkClient.users.getUser(userId);
    const role = (user.publicMetadata as { role?: string } | null)?.role;
    if (role === "admin") {
      next();
      return;
    }
  } catch (err) {
    req.log?.error({ err, userId }, "Failed to look up admin role");
  }

  res.status(403).json({ error: "Forbidden — admin only" });
}
