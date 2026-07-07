import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { isCronAuthorized } from "@/lib/cron";
import { sendCampaignNow } from "@/lib/newsletter-send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/newsletter/campaigns/run — send every scheduled campaign whose time
// has arrived. Meant for a cron trigger (presents CRON_SECRET); also runnable by
// an outreach staffer via a "Run now" action. sendCampaignNow claims each row, so
// an overlapping cron + manual run can't double-send.
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;
  }
  try {
    const due = await prisma.campaign.findMany({
      where: { status: "scheduled", scheduledFor: { lte: new Date() } },
      select: { id: true },
      take: 50,
    });
    let sent = 0;
    for (const c of due) {
      const r = await sendCampaignNow(c.id);
      if (r.ok) sent += 1;
    }
    return NextResponse.json({ ok: true, processed: due.length, sent });
  } catch (e) {
    console.error("campaigns run error:", e);
    return NextResponse.json({ error: "Failed to run scheduled sends" }, { status: 500 });
  }
}
