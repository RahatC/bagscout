// Resend integration via Replit Connectors (connector_name=resend).
// Credentials are fetched fresh on every send because access tokens expire.
import { Resend } from "resend";
import { logger } from "./logger";

type ResendCredentials = { apiKey: string; fromEmail: string };

async function fetchResendCredentials(): Promise<ResendCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Resend connector not available: missing REPLIT_CONNECTORS_HOSTNAME or REPL_IDENTITY/WEB_REPL_RENEWAL",
    );
  }

  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Resend connector lookup failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    items?: Array<{ settings?: { api_key?: string; from_email?: string } }>;
  };
  const item = data.items?.[0];
  const apiKey = item?.settings?.api_key;
  const fromEmail = item?.settings?.from_email;
  if (!apiKey || !fromEmail) {
    throw new Error("Resend connection is not configured (missing api_key or from_email)");
  }
  return { apiKey, fromEmail };
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional override for the verified sender (defaults to connection's from_email). */
  from?: string;
  /** Optional tag list forwarded to Resend for analytics/filtering. */
  tags?: { name: string; value: string }[];
};

export type SendEmailResult = {
  id: string;
  from: string;
  to: string;
};

/**
 * Send a single email via Resend with bounded retries on transient failures.
 * Throws on permanent failure so callers can record per-alert errors.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { apiKey, fromEmail } = await fetchResendCredentials();
  const from = input.from ?? fromEmail;
  const client = new Resend(apiKey);

  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await client.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: input.tags,
      });
      if (error) {
        // Resend SDK returns an error object instead of throwing for 4xx/5xx.
        // 4xx are permanent (bad address, unverified domain, …) — don't retry.
        const maybeStatus = (error as unknown as { statusCode?: unknown }).statusCode;
        const status = typeof maybeStatus === "number" ? maybeStatus : null;
        const transient = status == null || status >= 500 || status === 429;
        const errMsg = `${error.name ?? "ResendError"}: ${error.message ?? "unknown"}`;
        if (!transient || attempt === maxAttempts) {
          throw new Error(errMsg);
        }
        logger.warn(
          { attempt, status, to: input.to, subject: input.subject, error: errMsg },
          "Resend send failed, retrying",
        );
      } else if (data?.id) {
        logger.info(
          { attempt, to: input.to, subject: input.subject, resendId: data.id },
          "Email sent via Resend",
        );
        return { id: data.id, from, to: input.to };
      } else {
        throw new Error("Resend returned no id and no error");
      }
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const backoffMs = 250 * 2 ** (attempt - 1);
      logger.warn(
        {
          attempt,
          to: input.to,
          subject: input.subject,
          err: err instanceof Error ? err.message : String(err),
          backoffMs,
        },
        "Resend send threw, retrying",
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Resend send failed: ${String(lastErr)}`);
}

/**
 * Probe credentials so we can fail fast at digest start instead of after
 * partially sending. Returns the resolved sender for logging.
 */
export async function getResendSender(): Promise<string> {
  const { fromEmail } = await fetchResendCredentials();
  return fromEmail;
}
