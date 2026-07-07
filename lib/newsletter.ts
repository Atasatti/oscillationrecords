// Newsletter campaigns (Campaign) — composed in the admin, sent to the
// NewsletterSubscriber list. Pure — safe on server or client.

import { emailShell, escapeHtml, siteBaseUrl } from "@/lib/email";

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "failed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export function isCampaignStatus(v: unknown): v is CampaignStatus {
  return typeof v === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}

export const campaignStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** "YYYY-MM-DDTHH:mm" (from a datetime-local input) → a Date, or null. */
export function parseSchedule(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Render the composer's markdown-ish body into safe HTML. HTML is escaped FIRST,
 * then a tiny whitelist of formatting is applied, so no author input can inject
 * markup: paragraphs (blank line), line breaks, **bold**, *italic*, and
 * [text](https://…) links (http(s) only).
 */
export function renderNewsletterBody(md: string): string {
  const blocks = String(md).replace(/\r\n/g, "\n").split(/\n{2,}/);
  const html = blocks
    .map((raw) => {
      const block = raw.trim();
      if (!block) return "";
      let h = escapeHtml(block);
      h = h.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_m, text, url) => `<a href="${url}" style="color:#7aa2ff">${text}</a>`
      );
      h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      h = h.replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.6">${h}</p>`;
    })
    .filter(Boolean)
    .join("");
  return html;
}

/** Full email HTML for a campaign, with an optional open-tracking pixel. */
export function buildCampaignHtml(
  campaign: { id: string; subject: string; body: string },
  opts?: { track?: boolean }
): string {
  const inner = [
    `<h1 style="margin:0 0 18px;font-size:22px;color:#ffffff">${escapeHtml(campaign.subject)}</h1>`,
    renderNewsletterBody(campaign.body),
  ].join("");
  const pixel = opts?.track
    ? `<img src="${siteBaseUrl()}/api/newsletter/track/open?c=${encodeURIComponent(campaign.id)}" width="1" height="1" alt="" style="display:none">`
    : "";
  return emailShell(inner + pixel, { preheader: campaign.subject });
}
