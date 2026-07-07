// Server-only: the actual campaign send. Kept out of lib/newsletter.ts (which is
// imported client-side) because this touches prisma + the mail provider.
import { prisma } from "@/lib/prisma";
import { emailConfigured, isValidEmail, sendEmail } from "@/lib/email";
import { buildCampaignHtml } from "@/lib/newsletter";

export type SendOutcome =
  | { ok: true; status: "sent" | "failed"; recipientCount: number; sentCount: number; failedCount: number }
  | { ok: false; reason: "not_configured" | "not_sendable" };

const FROM_NAME = "Oscillation Records";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send a campaign now. Atomically "claims" it (draft/scheduled/failed → sending)
 * so overlapping triggers (a manual click racing the cron) can't double-send,
 * mails every valid subscriber, then records final counts + status. Returns
 * not_configured when no provider is set (nothing is sent or mutated).
 */
export async function sendCampaignNow(id: string): Promise<SendOutcome> {
  if (!emailConfigured()) return { ok: false, reason: "not_configured" };

  // Claim: only one caller can move it out of a sendable state.
  const claim = await prisma.campaign.updateMany({
    where: { id, status: { in: ["draft", "scheduled", "failed"] } },
    data: { status: "sending" },
  });
  if (claim.count !== 1) return { ok: false, reason: "not_sendable" };

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return { ok: false, reason: "not_sendable" };

  const subs = await prisma.newsletterSubscriber.findMany({ select: { email: true } });
  const recipients = subs.map((s) => s.email).filter(isValidEmail);
  const html = buildCampaignHtml({ id: campaign.id, subject: campaign.subject, body: campaign.body }, { track: true });

  let sent = 0;
  let failed = 0;
  // Bounded concurrency so a large list doesn't open hundreds of sockets at once.
  for (const batch of chunk(recipients, 10)) {
    const results = await Promise.all(
      batch.map((to) => sendEmail({ to, subject: campaign.subject, html, fromName: FROM_NAME }))
    );
    for (const r of results) { if (r.ok) sent += 1; else failed += 1; }
  }

  const status: "sent" | "failed" = sent === 0 && failed > 0 ? "failed" : "sent";
  await prisma.campaign.update({
    where: { id },
    data: { status, sentAt: new Date(), recipientCount: recipients.length, sentCount: sent, failedCount: failed },
  });
  return { ok: true, status, recipientCount: recipients.length, sentCount: sent, failedCount: failed };
}
