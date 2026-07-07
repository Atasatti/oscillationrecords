import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { campaignStr, parseSchedule } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// Only unsent campaigns can be edited/scheduled/deleted — a sent (or in-flight)
// campaign is immutable.
const EDITABLE = new Set(["draft", "scheduled", "failed"]);

// PATCH /api/newsletter/campaigns/[id] — edit subject/body, or (un)schedule.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (!EDITABLE.has(existing.status)) {
      return NextResponse.json({ error: "This campaign can no longer be edited" }, { status: 409 });
    }

    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("subject" in o) {
      const s = campaignStr(o.subject, 300);
      if (!s) return NextResponse.json({ error: "A subject is required" }, { status: 400 });
      data.subject = s;
    }
    if ("body" in o) data.body = campaignStr(o.body, 50_000) ?? "";
    // Schedule: a valid future datetime → scheduled; null/empty → back to draft.
    if ("scheduledFor" in o) {
      if (o.scheduledFor == null || o.scheduledFor === "") {
        data.scheduledFor = null;
        data.status = "draft";
      } else {
        const when = parseSchedule(o.scheduledFor);
        if (!when) return NextResponse.json({ error: "Invalid schedule date" }, { status: 400 });
        if (when.getTime() < Date.now()) {
          return NextResponse.json({ error: "Pick a time in the future" }, { status: 400 });
        }
        data.scheduledFor = when;
        data.status = "scheduled";
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const campaign = await prisma.campaign.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "campaign",
      resourceId: id,
      summary: `Updated newsletter "${campaign.subject}"${data.status ? ` → ${data.status}` : ""}`,
    });
    return NextResponse.json({ campaign });
  } catch (e) {
    console.error("campaign PATCH error:", e);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

// DELETE /api/newsletter/campaigns/[id] — only while unsent.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.campaign.findUnique({ where: { id }, select: { subject: true, status: true } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (!EDITABLE.has(existing.status)) {
      return NextResponse.json({ error: "A sent campaign can't be deleted" }, { status: 409 });
    }

    await prisma.campaign.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "campaign",
      resourceId: id,
      summary: `Deleted newsletter "${existing.subject}"`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("campaign DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
