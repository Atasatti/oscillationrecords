import { prisma } from "@/lib/prisma";
import { emailConfigured } from "@/lib/email";
import NewsletterClient, { type Campaign } from "./NewsletterClient";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  let campaigns: Campaign[] = [];
  let subscriberCount = 0;
  try {
    const [rows, count] = await Promise.all([
      prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.newsletterSubscriber.count(),
    ]);
    subscriberCount = count;
    campaigns = rows.map((c) => ({
      id: c.id,
      subject: c.subject,
      body: c.body,
      status: c.status,
      scheduledFor: c.scheduledFor ? c.scheduledFor.toISOString() : null,
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
      recipientCount: c.recipientCount,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      opens: c.opens,
    }));
  } catch {
    // Empty list on a transient DB error.
  }
  return (
    <NewsletterClient
      initial={campaigns}
      subscriberCount={subscriberCount}
      emailConfigured={emailConfigured()}
    />
  );
}
