import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  alertsTable,
  listingsTable,
  sourcesTable,
  bagPreferencesTable,
  matchResultsTable,
  notificationPreferencesTable,
  usersTable,
} from "@workspace/db";
import { renderAlertEmail } from "./alertEmail";
import { sendEmail, getResendSender } from "./mailClient";
import { logger } from "./logger";

/**
 * Parse a "HH:MM-HH:MM" quiet-hours window and decide whether `now` falls
 * inside it. Returns false on any malformed input so a bad row never blocks
 * delivery. Windows that cross midnight (e.g. "22:00-07:00") are supported.
 *
 * Times are interpreted in UTC because we do not yet store a per-user
 * timezone; once a user_profiles.timezone column lands, callers should
 * convert `now` to that zone before invoking this helper.
 */
export function isWithinQuietHours(quietHours: string, now: Date): boolean {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(quietHours.trim());
  if (!m) return false;
  const sH = Number(m[1]);
  const sM = Number(m[2]);
  const eH = Number(m[3]);
  const eM = Number(m[4]);
  if (
    sH > 23 || sH < 0 || eH > 23 || eH < 0 ||
    sM > 59 || sM < 0 || eM > 59 || eM < 0
  ) {
    return false;
  }
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  if (startMin === endMin) return false; // empty window
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Wraps midnight: e.g. 22:00-07:00 means [22:00, 24:00) ∪ [00:00, 07:00).
  return nowMin >= startMin || nowMin < endMin;
}

export type DigestRunResult = {
  dryRun: boolean;
  sender: string | null;
  pendingFound: number;
  usersNotified: number;
  alertsSent: number;
  alertsFailed: number;
  alertsSkipped: number;
  byFrequency: Record<"realtime" | "daily" | "weekly", number>;
  errors: { alertId: number; userId: string; error: string }[];
  skipped: { alertId: number; userId: string; reason: string }[];
  /** Set when the run aborted before sending (e.g. Resend creds missing). */
  aborted?: { reason: string };
};

/**
 * Send pending alerts via Resend, grouped per (user, alert).
 *
 * This is the single source of truth for digest delivery — both the admin
 * `POST /api/admin/digests/run` endpoint and the scheduled runner call this
 * function so behavior is identical regardless of trigger.
 *
 * Marks each alert "sent" only after Resend confirms a message id; failures
 * stay "pending" so the next run retries them. That gives the scheduler
 * idempotency for free: a crashed/cancelled run leaves the not-yet-sent
 * alerts pending and a follow-up run picks them up where it left off.
 */
export async function runDigest(
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<DigestRunResult> {
  const dryRun = opts.dryRun === true;
  const now = opts.now ?? new Date();

  // Fetch every pending alert with all the joins the email template needs in
  // one round-trip.
  const pending = await db
    .select({
      alert: alertsTable,
      listing: listingsTable,
      source: sourcesTable,
      preference: bagPreferencesTable,
      match: matchResultsTable,
      user: usersTable,
    })
    .from(alertsTable)
    .innerJoin(listingsTable, eq(alertsTable.listingId, listingsTable.id))
    .innerJoin(sourcesTable, eq(listingsTable.sourceId, sourcesTable.id))
    .innerJoin(
      bagPreferencesTable,
      eq(alertsTable.preferenceId, bagPreferencesTable.id),
    )
    .innerJoin(usersTable, eq(alertsTable.userId, usersTable.id))
    .leftJoin(
      matchResultsTable,
      eq(alertsTable.matchResultId, matchResultsTable.id),
    )
    .where(eq(alertsTable.status, "pending"));

  const userIdSet = new Set<string>();
  for (const row of pending) userIdSet.add(row.alert.userId);
  const userIds = [...userIdSet];

  const prefRows = userIds.length
    ? await db
        .select()
        .from(notificationPreferencesTable)
        .where(
          and(
            inArray(notificationPreferencesTable.userId, userIds),
            eq(notificationPreferencesTable.channel, "email"),
          ),
        )
    : [];
  const prefIndex = new Map<string, { enabled: boolean; quietHours: string | null }>();
  for (const p of prefRows) {
    prefIndex.set(`${p.userId}::${p.alertType}`, {
      enabled: p.enabled,
      quietHours: p.quietHours,
    });
  }
  const isEmailEnabled = (userId: string, alertType: string): boolean => {
    const v = prefIndex.get(`${userId}::${alertType}`);
    return v == null ? true : v.enabled;
  };
  const inQuietHours = (userId: string, alertType: string): boolean => {
    const v = prefIndex.get(`${userId}::${alertType}`);
    if (!v || !v.quietHours) return false;
    return isWithinQuietHours(v.quietHours, now);
  };

  const byFrequency: Record<"realtime" | "daily" | "weekly", number> = {
    realtime: 0,
    daily: 0,
    weekly: 0,
  };
  const sentAlertIds: number[] = [];
  const sendErrors: { alertId: number; userId: string; error: string }[] = [];
  const skipped: { alertId: number; userId: string; reason: string }[] = [];
  const usersNotified = new Set<string>();

  let sender: string | null = null;
  if (!dryRun && pending.length > 0) {
    try {
      sender = await getResendSender();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err },
        "Resend credentials unavailable, aborting digest run",
      );
      return {
        dryRun,
        sender: null,
        pendingFound: pending.length,
        usersNotified: 0,
        alertsSent: 0,
        alertsFailed: 0,
        alertsSkipped: 0,
        byFrequency,
        errors: [],
        skipped: [],
        aborted: { reason: `email_provider_unavailable: ${msg}` },
      };
    }
  }

  const appOrigin = process.env.PUBLIC_APP_ORIGIN ?? null;

  for (const row of pending) {
    const a = row.alert;
    const f =
      row.preference.alertFrequency === "realtime" ||
      row.preference.alertFrequency === "daily" ||
      row.preference.alertFrequency === "weekly"
        ? row.preference.alertFrequency
        : "realtime";

    if (!row.user.email) {
      skipped.push({
        alertId: a.id,
        userId: a.userId,
        reason: "no_email_on_user",
      });
      continue;
    }
    if (!isEmailEnabled(a.userId, a.alertType)) {
      skipped.push({
        alertId: a.id,
        userId: a.userId,
        reason: "email_opted_out",
      });
      continue;
    }
    if (inQuietHours(a.userId, a.alertType)) {
      // Stays "pending" so a later digest tick (outside the window) can
      // still deliver it.
      skipped.push({
        alertId: a.id,
        userId: a.userId,
        reason: "quiet_hours",
      });
      continue;
    }

    const rendered = renderAlertEmail({
      alert: a,
      listing: row.listing,
      source: row.source,
      preference: row.preference,
      match: row.match ?? null,
      appOrigin,
    });

    if (dryRun) {
      logger.info(
        {
          dryRun: true,
          alertId: a.id,
          userId: a.userId,
          to: row.user.email,
          subject: rendered.subject,
          alertType: a.alertType,
          textPreview: rendered.text.slice(0, 200),
        },
        "Digest dry-run: would send email",
      );
      byFrequency[f] += 1;
      usersNotified.add(a.userId);
      continue;
    }

    try {
      await sendEmail({
        to: row.user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [
          { name: "alert_type", value: a.alertType },
          { name: "frequency", value: f },
        ],
      });
      sentAlertIds.push(a.id);
      byFrequency[f] += 1;
      usersNotified.add(a.userId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, alertId: a.id, userId: a.userId, to: row.user.email },
        "Failed to send alert email",
      );
      sendErrors.push({ alertId: a.id, userId: a.userId, error: msg });
    }
  }

  if (sentAlertIds.length > 0) {
    await db
      .update(alertsTable)
      .set({
        status: "sent",
        sentAt: sql`now()`,
        digestSentAt: sql`now()`,
      })
      .where(
        and(
          eq(alertsTable.status, "pending"),
          inArray(alertsTable.id, sentAlertIds),
        ),
      );
  }

  return {
    dryRun,
    sender,
    pendingFound: pending.length,
    usersNotified: usersNotified.size,
    alertsSent: dryRun ? pending.length - skipped.length : sentAlertIds.length,
    alertsFailed: sendErrors.length,
    alertsSkipped: skipped.length,
    byFrequency,
    errors: sendErrors,
    skipped,
  };
}
