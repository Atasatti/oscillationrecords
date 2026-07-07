import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { sendCampaignNow } from "@/lib/newsletter-send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// POST /api/newsletter/campaigns/[id]/send — send a campaign now to every
// subscriber. Disabled (400) until an email provider is configured.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const result = await sendCampaignNow(id);
  if (!result.ok) {
    if (result.reason === "not_configured") {
      return NextResponse.json(
        { error: "Email sending isn't configured yet. Add an email provider to send." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "This campaign can't be sent" }, { status: 409 });
  }

  await recordAudit(request, guard.token, {
    action: "update",
    resource: "campaign",
    resourceId: id,
    summary: `Sent newsletter to ${result.sentCount}/${result.recipientCount} subscribers`,
    metadata: { sentCount: result.sentCount, failedCount: result.failedCount },
  });
  return NextResponse.json(result);
}
