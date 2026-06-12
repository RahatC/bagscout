import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock mailClient before importing digest so we never hit the real Resend API.
// Individual tests can read/reset the captured sends and override the mock
// behavior (e.g. force getResendSender to throw).
const mailMock = vi.hoisted(() => ({
  sends: [] as Array<{
    to: string;
    subject: string;
    html: string;
    text: string;
    tags?: { name: string; value: string }[];
  }>,
  sendImpl: null as
    | null
    | ((input: {
        to: string;
        subject: string;
        html: string;
        text: string;
        tags?: { name: string; value: string }[];
      }) => Promise<{ id: string; from: string; to: string }>),
  senderImpl: null as null | (() => Promise<string>),
}));

vi.mock("./mailClient", () => ({
  sendEmail: vi.fn(async (input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    tags?: { name: string; value: string }[];
  }) => {
    mailMock.sends.push(input);
    if (mailMock.sendImpl) return mailMock.sendImpl(input);
    return { id: `mock_${mailMock.sends.length}`, from: "test@bagscout.local", to: input.to };
  }),
  getResendSender: vi.fn(async () => {
    if (mailMock.senderImpl) return mailMock.senderImpl();
    return "test@bagscout.local";
  }),
}));

import { eq, sql } from "drizzle-orm";
import {
  db,
  alertsTable,
  bagPreferencesTable,
  listingsTable,
  notificationPreferencesTable,
  usersTable,
} from "@workspace/db";
import { runDigest, isWithinQuietHours } from "./digest";
import {
  cleanupTestData,
  ensureTestSource,
  ensureTestUser,
  makeTestUserId,
  refLookups,
} from "../test-utils/db";

const TEST_SOURCE_SLUG = "test_digest_source";
const DAILY_DIGEST_DUE_AT = new Date(Date.UTC(2026, 0, 15, 14, 0, 0));
const WEEKLY_DIGEST_DUE_AT = new Date(Date.UTC(2026, 0, 16, 14, 0, 0)); // Friday

let ref: Awaited<ReturnType<typeof refLookups>>;
let sourceId: number;

beforeAll(async () => {
  ref = await refLookups();
  sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Digest Source");
});

afterAll(async () => {
  await cleanupTestData({ testSourceSlug: TEST_SOURCE_SLUG });
});

beforeEach(async () => {
  await cleanupTestData({ testSourceSlug: TEST_SOURCE_SLUG });
  sourceId = await ensureTestSource(TEST_SOURCE_SLUG, "Test Digest Source");
  mailMock.sends.length = 0;
  mailMock.sendImpl = null;
  mailMock.senderImpl = null;
});

type SeedOpts = {
  alertFrequency?: "realtime" | "daily" | "weekly";
  alertType?: string;
  userEmail?: string | null;
  externalId?: string;
};

async function seedPendingAlert(
  userId: string,
  opts: SeedOpts = {},
): Promise<{ alertId: number; preferenceId: number; listingId: number }> {
  const externalId = opts.externalId ?? `dgst-${Math.random().toString(36).slice(2, 10)}`;

  if (opts.userEmail !== undefined) {
    await db
      .update(usersTable)
      .set({ email: opts.userEmail })
      .where(eq(usersTable.id, userId));
  }

  const [pref] = await db
    .insert(bagPreferencesTable)
    .values({
      userId,
      nickname: `pref-${externalId}`,
      exactModelEnabled: false,
      conditionMinId: ref.condition("very good").id,
      allowCloseColorMatch: true,
      maxPrice: "6000",
      onlyExactCriteria: false,
      allowCloseMatches: true,
      active: true,
      alertFrequency: opts.alertFrequency ?? "realtime",
    })
    .returning();

  const [listing] = await db
    .insert(listingsTable)
    .values({
      sourceId,
      sourceListingId: externalId,
      sourceUrl: `https://test.local/${externalId}`,
      title: "Chanel Classic Flap Medium Black",
      brand: "Chanel",
      normalizedBrand: "chanel",
      model: "Classic Flap",
      price: "5000.00",
      currency: "USD",
      availabilityStatus: "available",
      imageUrl: "https://test.local/img.jpg",
    })
    .returning();

  const [alert] = await db
    .insert(alertsTable)
    .values({
      userId,
      preferenceId: pref.id,
      listingId: listing.id,
      alertType: opts.alertType ?? "new_match",
      status: "pending",
      message: "matches your watchlist",
    })
    .returning();

  return { alertId: alert.id, preferenceId: pref.id, listingId: listing.id };
}

describe("digest delivery — notification_preferences filtering", () => {
  it("sends email when no preference row exists (default opt-in)", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId);

    const result = await runDigest({ dryRun: false });

    expect(result.alertsSent).toBe(1);
    expect(result.alertsSkipped).toBe(0);
    expect(result.usersNotified).toBe(1);
    expect(mailMock.sends).toHaveLength(1);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("sent");
    expect(a.sentAt).not.toBeNull();
  });

  it("skips the alert when (user, alert_type) is opted out on the email channel", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { alertType: "price_drop" });
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "price_drop",
      enabled: false,
    });

    const result = await runDigest({ dryRun: false });

    expect(result.alertsSent).toBe(0);
    expect(result.alertsSkipped).toBe(1);
    expect(result.skipped[0]).toMatchObject({ alertId, reason: "email_opted_out" });
    expect(mailMock.sends).toHaveLength(0);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("pending"); // unchanged so a future re-enable can deliver
  });

  it("ignores opt-out rows on other channels — push opt-out does not block the email send", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    await seedPendingAlert(userId, { alertType: "new_match" });
    // Opt out on push only — the email digest should not consult this row.
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "push",
      alertType: "new_match",
      enabled: false,
    });

    const result = await runDigest({ dryRun: false });

    expect(result.alertsSent).toBe(1);
    expect(result.alertsSkipped).toBe(0);
    expect(mailMock.sends).toHaveLength(1);
  });

  it("opt-out is scoped per alert_type — disabling price_drop still delivers new_match", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    await seedPendingAlert(userId, {
      alertType: "new_match",
      externalId: "mix-new",
    });
    await seedPendingAlert(userId, {
      alertType: "price_drop",
      externalId: "mix-drop",
    });
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "price_drop",
      enabled: false,
    });

    const result = await runDigest({ dryRun: false });

    expect(result.alertsSent).toBe(1);
    expect(result.alertsSkipped).toBe(1);
    expect(mailMock.sends).toHaveLength(1);
    expect(mailMock.sends[0].tags).toEqual(
      expect.arrayContaining([{ name: "alert_type", value: "new_match" }]),
    );
  });

  it("skips users without an email on file (cannot deliver)", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { userEmail: null });

    const result = await runDigest({ dryRun: false });

    expect(result.alertsSent).toBe(0);
    expect(result.alertsSkipped).toBe(1);
    expect(result.skipped[0]).toMatchObject({ alertId, reason: "no_email_on_user" });
    expect(mailMock.sends).toHaveLength(0);
  });

  it("persists quiet_hours on the notification_preferences row (storage round-trip)", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "new_match",
      enabled: true,
      quietHours: "22:00-07:00",
    });
    const [row] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, userId));
    expect(row.quietHours).toBe("22:00-07:00");
    expect(row.enabled).toBe(true);
  });
});

describe("digest delivery — quiet hours", () => {
  it("skips delivery when `now` falls inside the quiet window", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { alertType: "new_match" });
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "new_match",
      enabled: true,
      quietHours: "22:00-07:00",
    });

    // 02:30 UTC is inside the wrap-around 22:00→07:00 window.
    const result = await runDigest({
      dryRun: false,
      now: new Date(Date.UTC(2026, 0, 15, 2, 30, 0)),
    });

    expect(result.alertsSent).toBe(0);
    expect(result.alertsSkipped).toBe(1);
    expect(result.skipped[0]).toMatchObject({ alertId, reason: "quiet_hours" });
    expect(mailMock.sends).toHaveLength(0);

    // Stays pending so a later tick outside the window can deliver it.
    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("pending");
  });

  it("delivers when `now` falls outside the quiet window", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { alertType: "new_match" });
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "new_match",
      enabled: true,
      quietHours: "22:00-07:00",
    });

    // 14:00 UTC is well outside 22:00→07:00.
    const result = await runDigest({
      dryRun: false,
      now: new Date(Date.UTC(2026, 0, 15, 14, 0, 0)),
    });

    expect(result.alertsSent).toBe(1);
    expect(result.alertsSkipped).toBe(0);
    expect(mailMock.sends).toHaveLength(1);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("sent");
  });

  it("quiet-hours scoping is per (channel, alert_type) — only the matching row blocks", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    await seedPendingAlert(userId, { alertType: "new_match", externalId: "qh-new" });
    await seedPendingAlert(userId, { alertType: "price_drop", externalId: "qh-drop" });

    // Quiet hours configured ONLY for new_match — price_drop should still send.
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "new_match",
      enabled: true,
      quietHours: "00:00-23:59",
    });
    // A push-channel quiet-hours row must be ignored by the email digest.
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "push",
      alertType: "price_drop",
      enabled: true,
      quietHours: "00:00-23:59",
    });

    const result = await runDigest({
      dryRun: false,
      now: new Date(Date.UTC(2026, 0, 15, 12, 0, 0)),
    });

    expect(result.alertsSent).toBe(1);
    expect(result.alertsSkipped).toBe(1);
    expect(result.skipped[0].reason).toBe("quiet_hours");
    expect(mailMock.sends).toHaveLength(1);
    expect(mailMock.sends[0].tags).toEqual(
      expect.arrayContaining([{ name: "alert_type", value: "price_drop" }]),
    );
  });

  it("malformed quiet_hours strings are ignored (fail-open so bad config does not block alerts)", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    await seedPendingAlert(userId, { alertType: "new_match" });
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "new_match",
      enabled: true,
      quietHours: "not a window",
    });

    const result = await runDigest({
      dryRun: false,
      now: new Date(Date.UTC(2026, 0, 15, 3, 0, 0)),
    });
    expect(result.alertsSent).toBe(1);
    expect(result.alertsSkipped).toBe(0);
  });
});

describe("isWithinQuietHours — helper", () => {
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 0, 15, h, m, 0));

  it("non-wrapping window: 09:00-17:00", () => {
    expect(isWithinQuietHours("09:00-17:00", at(8, 59))).toBe(false);
    expect(isWithinQuietHours("09:00-17:00", at(9, 0))).toBe(true);
    expect(isWithinQuietHours("09:00-17:00", at(12, 30))).toBe(true);
    expect(isWithinQuietHours("09:00-17:00", at(16, 59))).toBe(true);
    expect(isWithinQuietHours("09:00-17:00", at(17, 0))).toBe(false);
  });

  it("wrap-around window: 22:00-07:00", () => {
    expect(isWithinQuietHours("22:00-07:00", at(21, 59))).toBe(false);
    expect(isWithinQuietHours("22:00-07:00", at(22, 0))).toBe(true);
    expect(isWithinQuietHours("22:00-07:00", at(2, 30))).toBe(true);
    expect(isWithinQuietHours("22:00-07:00", at(6, 59))).toBe(true);
    expect(isWithinQuietHours("22:00-07:00", at(7, 0))).toBe(false);
    expect(isWithinQuietHours("22:00-07:00", at(12, 0))).toBe(false);
  });

  it("returns false for malformed, empty, or out-of-range windows", () => {
    expect(isWithinQuietHours("", at(12, 0))).toBe(false);
    expect(isWithinQuietHours("garbage", at(12, 0))).toBe(false);
    expect(isWithinQuietHours("9:00-17:00", at(12, 0))).toBe(false); // not zero-padded
    expect(isWithinQuietHours("25:00-26:00", at(12, 0))).toBe(false);
    expect(isWithinQuietHours("09:60-17:00", at(12, 0))).toBe(false);
    expect(isWithinQuietHours("12:00-12:00", at(12, 0))).toBe(false); // empty
  });
});

describe("digest grouping — byFrequency buckets", () => {
  it("counts each sent alert under the originating preference's alertFrequency", async () => {
    const userA = makeTestUserId();
    const userB = makeTestUserId();
    const userC = makeTestUserId();
    await ensureTestUser(userA);
    await ensureTestUser(userB);
    await ensureTestUser(userC);

    await seedPendingAlert(userA, { alertFrequency: "realtime", externalId: "f-rt-1" });
    await seedPendingAlert(userA, { alertFrequency: "realtime", externalId: "f-rt-2" });
    await seedPendingAlert(userB, { alertFrequency: "daily", externalId: "f-dy-1" });
    await seedPendingAlert(userC, { alertFrequency: "weekly", externalId: "f-wk-1" });

    const result = await runDigest({ dryRun: false, now: WEEKLY_DIGEST_DUE_AT });

    expect(result.alertsSent).toBe(4);
    expect(result.usersNotified).toBe(3);
    expect(result.byFrequency).toEqual({ realtime: 2, daily: 1, weekly: 1 });
    expect(mailMock.sends).toHaveLength(4);
  });

  it("dryRun does not call mailClient and does not flip alert status", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { alertFrequency: "daily" });

    const result = await runDigest({ dryRun: true, now: DAILY_DIGEST_DUE_AT });

    expect(result.dryRun).toBe(true);
    expect(result.alertsSent).toBe(1);
    expect(result.byFrequency.daily).toBe(1);
    expect(mailMock.sends).toHaveLength(0);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("pending");
    expect(a.sentAt).toBeNull();
  });

  it("skipped alerts are excluded from byFrequency (only successful sends are counted)", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    await seedPendingAlert(userId, { alertFrequency: "weekly", alertType: "new_match" });
    await db.insert(notificationPreferencesTable).values({
      userId,
      channel: "email",
      alertType: "new_match",
      enabled: false,
    });

    const result = await runDigest({ dryRun: false });

    expect(result.alertsSent).toBe(0);
    expect(result.alertsSkipped).toBe(1);
    expect(result.byFrequency).toEqual({ realtime: 0, daily: 0, weekly: 0 });
    expect(result.usersNotified).toBe(0);
  });

  it("aborts the run cleanly when the email provider is unavailable", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId);
    mailMock.senderImpl = async () => {
      throw new Error("connector lookup failed");
    };

    const result = await runDigest({ dryRun: false });

    expect(result.aborted).toBeDefined();
    expect(result.aborted?.reason).toMatch(/email_provider_unavailable/);
    expect(result.alertsSent).toBe(0);
    expect(mailMock.sends).toHaveLength(0);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("pending"); // safe to retry on next tick
  });

  it("records per-alert send failures without aborting the rest of the run", async () => {
    const userA = makeTestUserId();
    const userB = makeTestUserId();
    await ensureTestUser(userA);
    await ensureTestUser(userB);
    const { alertId: aId } = await seedPendingAlert(userA, { externalId: "ok-1" });
    const { alertId: bId } = await seedPendingAlert(userB, { externalId: "boom-1" });

    let calls = 0;
    mailMock.sendImpl = async (input) => {
      calls++;
      // Fail only the second send.
      if (calls === 2) throw new Error("simulated transient failure");
      return { id: `m_${calls}`, from: "test@bagscout.local", to: input.to };
    };

    const result = await runDigest({ dryRun: false });

    expect(result.alertsSent + result.alertsFailed).toBe(2);
    expect(result.alertsFailed).toBe(1);
    expect(result.alertsSent).toBe(1);
    expect(result.errors).toHaveLength(1);

    // Exactly one alert should have transitioned to "sent".
    const rows = await db
      .select({ id: alertsTable.id, status: alertsTable.status })
      .from(alertsTable)
      .where(sql`${alertsTable.id} IN (${aId}, ${bId})`);
    const sent = rows.filter((r) => r.status === "sent");
    const pending = rows.filter((r) => r.status === "pending");
    expect(sent).toHaveLength(1);
    expect(pending).toHaveLength(1);
  });
});

describe("digest delivery — alertFrequency cadence", () => {
  it("keeps daily alerts pending before the daily digest window", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { alertFrequency: "daily" });

    const result = await runDigest({
      dryRun: false,
      now: new Date(Date.UTC(2026, 0, 15, 13, 59, 0)),
    });

    expect(result.alertsSent).toBe(0);
    expect(result.alertsSkipped).toBe(1);
    expect(result.skipped[0]).toMatchObject({
      alertId,
      reason: "daily_digest_not_due",
    });
    expect(mailMock.sends).toHaveLength(0);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("pending");
  });

  it("delivers daily alerts once the daily digest window opens", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { alertFrequency: "daily" });

    const result = await runDigest({ dryRun: false, now: DAILY_DIGEST_DUE_AT });

    expect(result.alertsSent).toBe(1);
    expect(result.byFrequency.daily).toBe(1);
    expect(mailMock.sends).toHaveLength(1);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("sent");
  });

  it("keeps weekly alerts pending until the Friday digest window", async () => {
    const userId = makeTestUserId();
    await ensureTestUser(userId);
    const { alertId } = await seedPendingAlert(userId, { alertFrequency: "weekly" });

    const result = await runDigest({
      dryRun: false,
      now: new Date(Date.UTC(2026, 0, 15, 14, 0, 0)), // Thursday
    });

    expect(result.alertsSent).toBe(0);
    expect(result.alertsSkipped).toBe(1);
    expect(result.skipped[0]).toMatchObject({
      alertId,
      reason: "weekly_digest_not_due",
    });
    expect(mailMock.sends).toHaveLength(0);

    const [a] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    expect(a.status).toBe("pending");
  });
});
