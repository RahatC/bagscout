import type { Request, Response, NextFunction } from "express";

/**
 * Mutable holder so tests can change "the current user" between requests
 * within a single suite. The vi.mock() of `requireAuth` reads from this.
 */
export const testAuthState: { userId: string | null } = { userId: null };

export function setTestUser(userId: string | null): void {
  testAuthState.userId = userId;
}

export async function fakeRequireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!testAuthState.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { userId: string }).userId = testAuthState.userId;
  next();
}
