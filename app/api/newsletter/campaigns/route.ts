import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { resolveUserId } from "@/lib/current-user";
import { emailConfigured } from "@/lib/email";
import { campaignStr } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/newsletter/campaigns — all campaigns + the current subscriber count
// (so the composer can show "will send to N") + whether email is configured.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const [campaigns, subscriberCount] = await Promise.all([
      prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.newsletterSubscriber.count(),
    ]);
    return NextResponse.json(
      { campaigns, subscriberCount, emailConfigured: emailConfigured() },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("campaigns GET error:", e);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}

// POST /api/newsletter/campaigns — create a draft.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const subject = campaignStr(o.subject, 300);
    if (!subject) return NextResponse.json({ error: "A subject is required" }, { status: 400 });

    const campaign = await prisma.campaign.create({
      data: {
        subject,
        body: campaignStr(o.body, 50_000) ?? "",
        status: "draft",
        createdById: await resolveUserId(guard.token),
      },
    });
    await recordAudit(request, guard.token, {
      action: "create",
      resource: "campaign",
      resourceId: campaign.id,
      summary: `Drafted newsletter "${campaign.subject}"`,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (e) {
    console.error("campaigns POST error:", e);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
