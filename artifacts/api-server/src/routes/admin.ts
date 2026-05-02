import { Router } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import {
  db,
  sourcesTable,
  listingsTable,
  ingestionLogsTable,
  alertsTable,
  bagPreferencesTable,
  matchResultsTable,
  notificationPreferencesTable,
  usersTable,
} from "@workspace/db";
import { TriggerIngestBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { runMockIngest, runAllIngests } from "../lib/ingest";
import { renderAlertEmail } from "../lib/alertEmail";
import { sendEmail, getResendSender } from "../lib/mailClient";
import { logger } from "../lib/logger";
import { count } from "drizzle-orm";

const router = Router();

// All admin endpoints require both auth + admin role.
router.use(requireAuth, requireAdmin);

router.get("/sources", async (_req, res) => {
  const rows = await db
    .select({
      source: sourcesTable,
      listingCount: count(listingsTable.id),
    })
    .from(sourcesTable)
    .leftJoin(listingsTable, eq(listingsTable.sourceId, sourcesTable.id))
    .groupBy(sourcesTable.id)
    .orderBy(sourcesTable.name);

  res.json(
    rows.map((r) => ({
      ...r.source,
      listingCount: r.listingCount,
    })),
  );
});

router.get("/ingestion-logs", async (req, res) => {
  const raw = parseInt((req.query.limit as string) ?? "50", 10);
  if (req.query.limit != null && (isNaN(raw) || raw < 1)) {
    res.status(400).json({ error: "Invalid limit" });
    return;
  }
  const limit = Math.min(Number.isNaN(raw) ? 50 : raw, 200);

  const rows = await db
    .select({
      log: ingestionLogsTable,
      sourceName: sourcesTable.name,
    })
    .from(ingestionLogsTable)
    .innerJoin(sourcesTable, eq(ingestionLogsTable.sourceId, sourcesTable.id))
    .orderBy(desc(ingestionLogsTable.startedAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      ...r.log,
      sourceName: r.sourceName,
    })),
  );
});

router.post("/ingest", async (req, res) => {
  const parsed = TriggerIngestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  // Special slug "all" runs every registered adapter sequentially.
  if (parsed.data.sourceSlug === "all") {
    const results = await runAllIngests();
    const totals = results.reduce(
      (acc, r) => {
        acc.listingsFound += r.listingsFound;
        acc.listingsAdded += r.listingsAdded;
        acc.listingsUpdated += r.listingsUpdated;
        acc.durationMs += r.durationMs;
        acc.errors.push(...r.errors);
        return acc;
      },
      {
        sourceSlug: "all",
        listingsFound: 0,
        listingsAdded: 0,
        listingsUpdated: 0,
        durationMs: 0,
        errors: [] as string[],
      },
    );
    res.json({ ...totals, perSource: results });
    return;
  }
  const result = await runMockIngest(parsed.data.sourceSlug);
  res.json(result);
});

// POST /api/admin/digests/run
// Send pending alerts via Resend, grouped per (user, alert). Respects the
// per-user notification_preferences row for channel="email" and the alert's
// alert_type. An alert is only flipped from "pending" -> "sent" after the
// Resend call returns a message id; failures are recorded so a later run can
// retry. Pass `dryRun: true` to render + log emails without calling Resend.
router.post("/digests/run", async (req, res) => {
  const dryRun = req.body?.dryRun === true;

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

  // Load all email-channel notification preferences for the affected users in
  // one query, then index by (userId, alertType). Default = enabled when no
  // explicit row exists.
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
  const prefIndex = new Map<string, boolean>();
  for (const p of prefRows) {
    prefIndex.set(`${p.userId}::${p.alertType}`, p.enabled);
  }
  const isEmailEnabled = (userId: string, alertType: string): boolean => {
    const v = prefIndex.get(`${userId}::${alertType}`);
    return v == null ? true : v;
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

  // Probe Resend credentials once so we fail fast if the connection is broken
  // (skipped in dry-run since we won't be sending anything).
  let sender: string | null = null;
  if (!dryRun) {
    try {
      sender = await getResendSender();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Resend credentials unavailable, aborting digest run");
      res.status(503).json({ error: `Email provider unavailable: ${msg}` });
      return;
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
      skipped.push({ alertId: a.id, userId: a.userId, reason: "no_email_on_user" });
      continue;
    }
    if (!isEmailEnabled(a.userId, a.alertType)) {
      skipped.push({ alertId: a.id, userId: a.userId, reason: "email_opted_out" });
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

  // Only mark alerts "sent" once Resend confirmed delivery. Failed/skipped
  // alerts stay "pending" so a subsequent digest run can retry them.
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

  res.json({
    dryRun,
    sender,
    usersNotified: usersNotified.size,
    alertsSent: dryRun
      ? pending.length - skipped.length
      : sentAlertIds.length,
    alertsFailed: sendErrors.length,
    alertsSkipped: skipped.length,
    byFrequency,
    errors: sendErrors,
    skipped,
  });
});

export default router;
