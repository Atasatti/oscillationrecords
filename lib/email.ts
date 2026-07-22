// Provider-agnostic transactional email over plain fetch — no SDK dependency.
// Two interchangeable delivery providers: Twilio SendGrid (SENDGRID_API_KEY) and
// Resend (RESEND_API_KEY); set whichever key you have, plus EMAIL_FROM (a sender
// verified with that provider). If both keys are present, EMAIL_PROVIDER
// ("sendgrid" | "resend") picks. Use a RESTRICTED key — SendGrid: a key scoped
// to "Mail Send" only; Resend: a sending-only key — never a full-access one; the
// key lives server-side only (no NEXT_PUBLIC_*).
//
// The provider is delivery ONLY. Campaigns, scheduling, the subscriber list,
// open tracking and unsubscribe are all in-house (lib/newsletter*.ts) with the
// site database as the single source of truth — deliberately NOT synced into a
// provider's contact/marketing suite (see docs/DATA-RETENTION.md: account
// deletion erases a subscriber in one place, and a second copy in a provider
// would break that).
//
// Everything degrades gracefully when unconfigured: emailConfigured() is false
// and sendEmail() returns { ok:false, reason:"not_configured" }, so the
// newsletter composer and the digest preview work with no provider set; only
// the actual send is disabled until a key + EMAIL_FROM are added.

export type EmailProvider = "sendgrid" | "resend";

const PROVIDER_ENDPOINTS: Record<EmailProvider, string> = {
  sendgrid: "https://api.sendgrid.com/v3/mail/send",
  resend: "https://api.resend.com/emails",
};

/**
 * Which delivery provider is usable: an explicit EMAIL_PROVIDER wins but only
 * when its key is actually present (naming a provider whose key is missing is a
 * misconfiguration — stay off rather than silently sending via the other one);
 * otherwise whichever single key is set.
 */
export function emailProvider(): EmailProvider | null {
  const forced = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (forced === "sendgrid") return process.env.SENDGRID_API_KEY ? "sendgrid" : null;
  if (forced === "resend") return process.env.RESEND_API_KEY ? "resend" : null;
  if (process.env.SENDGRID_API_KEY) return "sendgrid";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export function emailConfigured(): boolean {
  return Boolean(emailProvider() && process.env.EMAIL_FROM);
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM || "";
}

/** Absolute site origin (no trailing slash) for tracking pixels + links in email. */
export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://oscillationrecords.com").replace(/\/+$/, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && v.length <= 320 && EMAIL_RE.test(v);
}

/** Wrap inner HTML in a dark, 600px, table-based email shell with the label
 *  header/footer. Table layout + inline styles for broad client support. */
export function emailShell(innerHtml: string, opts?: { preheader?: string }): string {
  const preheader = opts?.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>`
    : "";
  return [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;background:#0b0b0c;color:#e7e7ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
    preheader,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c"><tr><td align="center" style="padding:24px">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#141416;border-radius:12px;overflow:hidden">',
    '<tr><td style="padding:22px 28px;border-bottom:1px solid #26262a"><span style="font-size:18px;font-weight:700;color:#ffffff">Oscillation Records</span></td></tr>',
    `<tr><td style="padding:28px">${innerHtml}</td></tr>`,
    '<tr><td style="padding:18px 28px;border-top:1px solid #26262a;color:#8a8a92;font-size:12px">Oscillation Records · Manchester, UK</td></tr>',
    '</table></td></tr></table></body></html>',
  ].join("");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not_configured" | "error"; error?: string };

export interface SendMessage {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
}

/**
 * The provider-specific request body for one message. Pure and exported so the
 * two payload shapes are unit-testable without a network — they're the part
 * that silently breaks when a provider is swapped.
 */
export function buildSendBody(
  provider: EmailProvider,
  msg: SendMessage,
  fromEmail: string
): Record<string, unknown> {
  const to = Array.isArray(msg.to) ? msg.to : [msg.to];
  if (provider === "sendgrid") {
    return {
      personalizations: [{ to: to.map((email) => ({ email })) }],
      from: { email: fromEmail, ...(msg.fromName ? { name: msg.fromName } : {}) },
      subject: msg.subject,
      content: [{ type: "text/html", value: msg.html }],
      ...(msg.replyTo ? { reply_to: { email: msg.replyTo } } : {}),
    };
  }
  return {
    from: msg.fromName ? `${msg.fromName} <${fromEmail}>` : fromEmail,
    to,
    subject: msg.subject,
    html: msg.html,
    ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
  };
}

/** Send one email via the configured provider. Returns not_configured (never
 *  throws) when the provider env is absent, so callers can treat "no provider"
 *  as a normal state. `id` is the provider's message id (SendGrid returns it in
 *  the X-Message-Id header; Resend in the JSON body), or null if not exposed. */
export async function sendEmail(msg: SendMessage): Promise<SendResult> {
  const provider = emailProvider();
  if (!provider || !emailConfigured()) return { ok: false, reason: "not_configured" };
  const apiKey =
    provider === "sendgrid" ? process.env.SENDGRID_API_KEY : process.env.RESEND_API_KEY;
  try {
    const res = await fetch(PROVIDER_ENDPOINTS[provider], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildSendBody(provider, msg, emailFrom())),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: "error", error: `${res.status} ${text.slice(0, 200)}` };
    }
    if (provider === "sendgrid") {
      // Success is 202 with an empty body; the message id travels in a header.
      return { ok: true, id: res.headers.get("x-message-id") };
    }
    const j = await res.json().catch(() => ({}));
    return { ok: true, id: typeof j?.id === "string" ? j.id : null };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "send failed" };
  }
}
