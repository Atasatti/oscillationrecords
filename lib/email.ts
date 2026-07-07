// Provider-agnostic transactional email. Sends via Resend's REST API using plain
// fetch — no SDK dependency. Everything degrades gracefully when unconfigured:
// emailConfigured() is false and sendEmail() returns { ok:false, reason:"not_configured" },
// so the newsletter composer and the digest preview work with no provider set;
// only the actual send is disabled until RESEND_API_KEY + EMAIL_FROM are added.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
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

/** Send one email via Resend. Returns not_configured (never throws) when the
 *  provider env is absent, so callers can treat "no provider" as a normal state. */
export async function sendEmail(msg: {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
}): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, reason: "not_configured" };
  const from = msg.fromName ? `${msg.fromName} <${emailFrom()}>` : emailFrom();
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: "error", error: `${res.status} ${text.slice(0, 200)}` };
    }
    const j = await res.json().catch(() => ({}));
    return { ok: true, id: typeof j?.id === "string" ? j.id : null };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "send failed" };
  }
}
