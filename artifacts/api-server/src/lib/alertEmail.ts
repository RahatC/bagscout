// Shared alert email template. Used by both:
//   - GET /api/alerts/:id/preview  (admin/user preview)
//   - POST /api/admin/digests/run  (outbound Resend send)
// so the preview pane and the actual delivered email can never drift.

import type {
  alertsTable,
  listingsTable,
  sourcesTable,
  bagPreferencesTable,
  matchResultsTable,
} from "@workspace/db";
import { mapListing } from "./mappers";

type AlertRow = typeof alertsTable.$inferSelect;
type ListingRow = typeof listingsTable.$inferSelect;
type SourceRow = typeof sourcesTable.$inferSelect;
type PreferenceRow = typeof bagPreferencesTable.$inferSelect;
type MatchRow = typeof matchResultsTable.$inferSelect;

export type AlertContext = {
  alert: AlertRow;
  listing: ListingRow;
  source: SourceRow;
  preference: PreferenceRow | null;
  match: MatchRow | null;
  /** Public absolute origin used for click-through links (e.g. https://bagscout.example.com). */
  appOrigin?: string | null;
};

const ALERT_SUBJECT: Record<string, (brand: string, model: string | null) => string> = {
  new_match: (brand, model) => `New match: ${brand}${model ? ` ${model}` : ""}`,
  exact_model: (brand, model) => `Exact match: ${brand}${model ? ` ${model}` : ""}`,
  price_drop: (brand, model) => `Price drop on ${brand}${model ? ` ${model}` : ""}`,
  back_in_stock: (brand, model) => `Back in stock: ${brand}${model ? ` ${model}` : ""}`,
  better_condition: (brand, model) =>
    `Better condition appeared: ${brand}${model ? ` ${model}` : ""}`,
  under_target_price: (brand, model) =>
    `Under your target: ${brand}${model ? ` ${model}` : ""}`,
};

const ALERT_HEADING: Record<string, string> = {
  new_match: "We found a match for your watchlist",
  exact_model: "Your exact model just appeared",
  price_drop: "Price just dropped",
  back_in_stock: "Back in stock",
  better_condition: "A better-condition listing showed up",
  under_target_price: "Priced under your target",
};

export type AlertPreviewPayload = {
  id: number;
  alertType: string;
  subject: string;
  heading: string;
  whyMatched: string;
  whyNow: string | null;
  matchScore: number | null;
  matchType: string | null;
  preferenceNickname: string | null;
  listing: ReturnType<typeof mapListing>;
  listingUrl: string;
  viewUrl: string;
  saveUrl: string;
  createdAt: Date;
};

export type RenderedAlertEmail = {
  subject: string;
  html: string;
  text: string;
  preview: AlertPreviewPayload;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

/** Build the JSON preview payload for /alerts/:id/preview. */
export function buildAlertPreview(ctx: AlertContext): AlertPreviewPayload {
  const { alert: a, listing: l, source: s, preference: p, match: m } = ctx;
  const subjectFn = ALERT_SUBJECT[a.alertType] ?? ALERT_SUBJECT.new_match;
  const heading = ALERT_HEADING[a.alertType] ?? ALERT_HEADING.new_match;
  return {
    id: a.id,
    alertType: a.alertType,
    subject: subjectFn(l.brand, l.model),
    heading,
    whyMatched:
      m?.matchExplanation ?? a.message ?? "Matches your watchlist criteria.",
    whyNow: a.whyNow,
    matchScore: m?.matchScore ? parseFloat(m.matchScore) : null,
    matchType: m?.matchType ?? null,
    preferenceNickname: p?.nickname ?? null,
    listing: mapListing(l, s),
    listingUrl: l.sourceUrl,
    viewUrl: `/listings/${l.id}`,
    saveUrl: `/listings/${l.id}?save=1`,
    createdAt: a.createdAt,
  };
}

/** Build subject/html/text for an outbound email + the matching preview payload. */
export function renderAlertEmail(ctx: AlertContext): RenderedAlertEmail {
  const preview = buildAlertPreview(ctx);
  const l = ctx.listing;
  const origin = (ctx.appOrigin ?? "").replace(/\/$/, "");
  const absViewUrl = origin ? `${origin}${preview.viewUrl}` : preview.viewUrl;
  const absSaveUrl = origin ? `${origin}${preview.saveUrl}` : preview.saveUrl;

  const priceLine = fmtPrice(parseFloat(l.price), l.currency);
  const originalPrice = l.originalPrice ? parseFloat(l.originalPrice) : null;
  const discount = originalPrice && originalPrice > parseFloat(l.price)
    ? ` (was ${fmtPrice(originalPrice, l.currency)})`
    : "";
  const conditionLine = l.condition ? `Condition: ${l.condition}` : null;
  const colorLine = l.color ? `Color: ${l.color}` : null;
  const sourceLine = `Source: ${ctx.source.name}`;
  const prefLine = preview.preferenceNickname
    ? `Watchlist: ${preview.preferenceNickname}`
    : null;

  const facts = [prefLine, conditionLine, colorLine, sourceLine].filter(Boolean) as string[];

  // Plain-text body (deliverability + accessibility).
  const textLines: string[] = [
    preview.heading,
    "",
    `${l.brand}${l.model ? ` ${l.model}` : ""} — ${priceLine}${discount}`,
    "",
    preview.whyMatched,
  ];
  if (preview.whyNow) {
    textLines.push("", preview.whyNow);
  }
  if (facts.length > 0) {
    textLines.push("", ...facts);
  }
  textLines.push(
    "",
    `View on BagScout: ${absViewUrl}`,
    `View original listing: ${preview.listingUrl}`,
    `Save: ${absSaveUrl}`,
  );
  const text = textLines.join("\n");

  const safeImg = l.imageUrl ? escapeHtml(l.imageUrl) : null;
  const titleSafe = escapeHtml(`${l.brand}${l.model ? ` ${l.model}` : ""}`);
  const headingSafe = escapeHtml(preview.heading);
  const whyMatchedSafe = escapeHtml(preview.whyMatched);
  const whyNowSafe = preview.whyNow ? escapeHtml(preview.whyNow) : null;
  const factsHtml = facts
    .map((f) => `<li style="margin:0 0 4px 0;">${escapeHtml(f)}</li>`)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(preview.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e3da;">
        <tr><td style="padding:24px 28px 8px 28px;">
          <p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8a8378;">BagScout alert</p>
          <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#1a1a1a;">${headingSafe}</h1>
        </td></tr>
        ${
          safeImg
            ? `<tr><td style="padding:16px 28px 0 28px;"><img src="${safeImg}" alt="${titleSafe}" style="display:block;width:100%;max-width:504px;height:auto;border-radius:8px;border:1px solid #ece8de;"></td></tr>`
            : ""
        }
        <tr><td style="padding:16px 28px 0 28px;">
          <p style="margin:0;font-size:18px;font-weight:600;">${titleSafe}</p>
          <p style="margin:6px 0 0 0;font-size:18px;color:#1a1a1a;">${escapeHtml(priceLine)}${discount ? `<span style="color:#8a8378;font-size:14px;font-weight:400;"> ${escapeHtml(discount)}</span>` : ""}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 0 28px;">
          <p style="margin:0;font-size:14px;line-height:1.5;color:#1a1a1a;">${whyMatchedSafe}</p>
          ${
            whyNowSafe
              ? `<p style="margin:8px 0 0 0;font-size:13px;color:#8a5a00;background:#fff7e6;border:1px solid #f3e3b8;padding:8px 10px;border-radius:6px;">${whyNowSafe}</p>`
              : ""
          }
        </td></tr>
        ${
          factsHtml
            ? `<tr><td style="padding:16px 28px 0 28px;"><ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#4a4a4a;">${factsHtml}</ul></td></tr>`
            : ""
        }
        <tr><td style="padding:24px 28px 28px 28px;">
          <a href="${escapeHtml(absViewUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:600;">View on BagScout</a>
          <a href="${escapeHtml(preview.listingUrl)}" style="display:inline-block;margin-left:8px;color:#1a1a1a;text-decoration:underline;padding:12px 4px;font-size:14px;">View original listing</a>
        </td></tr>
        <tr><td style="padding:0 28px 24px 28px;border-top:1px solid #ece8de;">
          <p style="margin:16px 0 0 0;font-size:11px;color:#8a8378;">You're receiving this because you have a BagScout watchlist for ${escapeHtml(preview.preferenceNickname ?? "this style")}. Manage email preferences in your account settings.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: preview.subject, html, text, preview };
}
