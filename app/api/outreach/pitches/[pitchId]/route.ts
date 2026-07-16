import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { onPitchAccepted } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/pitches/[pitchId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pitchId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:read");
    if (!guard.ok) return guard.response;

    const { pitchId } = await params;
    const pitch = await prisma.pitchLog.findUnique({ where: { id: pitchId } });
    if (!pitch) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    return NextResponse.json(pitch);
  } catch (error) {
    console.error("Error fetching pitch:", error);
    return NextResponse.json({ error: "Failed to fetch pitch" }, { status: 500 });
  }
}

// PUT /api/outreach/pitches/[pitchId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pitchId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { pitchId } = await params;
    const body = await request.json();
    const { contactId, artistIds, releaseIds, status, sentAt, followUpDueAt, responseNotes, notes } = body;

    if (!contactId?.trim()) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    const existing = await prisma.pitchLog.findUnique({ where: { id: pitchId } });
    if (!existing) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });

    // Verify the referenced contact exists BEFORE mutating: otherwise we'd store a
    // dangling contactId and then throw P2025 on the status-sync update below —
    // after the pitch was already written (a partial write + a misleading 500).
    const contact = await prisma.outreachContact.findUnique({ where: { id: contactId }, select: { id: true } });
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    const pitch = await prisma.pitchLog.update({
      where: { id: pitchId },
      data: {
        contactId,
        artistIds: Array.isArray(artistIds) ? artistIds : [],
        releaseIds: Array.isArray(releaseIds) ? releaseIds : [],
        status: status || "not_sent",
        sentAt: sentAt ? new Date(sentAt) : null,
        followUpDueAt: followUpDueAt ? new Date(followUpDueAt) : null,
        responseNotes: responseNotes?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    // Sync contact status when pitch is accepted or responded to. updateMany (not
    // update) so a contact deleted in the TOCTOU window no-ops instead of throwing
    // P2025 after the pitch commit.
    if (status === "accepted") {
      await prisma.outreachContact.updateMany({
        where: { id: contactId },
        data: { relationshipStatus: "published", lastContactedAt: new Date() },
      });
    } else if (status === "followed_up" || status === "sent") {
      await prisma.outreachContact.updateMany({
        where: { id: contactId },
        data: { lastContactedAt: new Date(), relationshipStatus: "contacted" },
      });
    }

    // Automation: fire only on the transition into "accepted" (not on re-saves).
    if (status === "accepted" && existing.status !== "accepted") {
      await onPitchAccepted(pitch);
    }

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "pitch",
      resourceId: pitch.id,
      summary: `Updated pitch ${pitch.id}`,
    });

    return NextResponse.json(pitch);
  } catch (error) {
    console.error("Error updating pitch:", error);
    return NextResponse.json({ error: "Failed to update pitch" }, { status: 500 });
  }
}

// PATCH /api/outreach/pitches/[pitchId] — status toggle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pitchId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { pitchId } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") data.status = body.status;
    if (body.followUpDueAt !== undefined) data.followUpDueAt = body.followUpDueAt ? new Date(body.followUpDueAt) : null;
    if (body.sentAt !== undefined) data.sentAt = body.sentAt ? new Date(body.sentAt) : null;

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const existing = await prisma.pitchLog.findUnique({ where: { id: pitchId } });
    if (!existing) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });

    const pitch = await prisma.pitchLog.update({ where: { id: pitchId }, data });

    // Sync contact relationship status. updateMany (not update) so a status toggle
    // still succeeds when the pitch's stored contact has since been deleted — it
    // no-ops instead of throwing P2025 after the pitch was already updated.
    if (body.status === "accepted") {
      await prisma.outreachContact.updateMany({
        where: { id: existing.contactId },
        data: { relationshipStatus: "published", lastContactedAt: new Date() },
      });
    } else if (body.status === "sent" || body.status === "followed_up") {
      await prisma.outreachContact.updateMany({
        where: { id: existing.contactId },
        data: { lastContactedAt: new Date(), relationshipStatus: "contacted" },
      });
    }

    // Automation: fire only on the transition into "accepted" (not on re-saves).
    if (body.status === "accepted" && existing.status !== "accepted") {
      await onPitchAccepted(pitch);
    }

    return NextResponse.json(pitch);
  } catch (error) {
    console.error("Error patching pitch:", error);
    return NextResponse.json({ error: "Failed to update pitch" }, { status: 500 });
  }
}

// DELETE /api/outreach/pitches/[pitchId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pitchId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { pitchId } = await params;
    const existing = await prisma.pitchLog.findUnique({ where: { id: pitchId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });

    await prisma.pitchLog.delete({ where: { id: pitchId } });

    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "pitch",
      resourceId: pitchId,
      summary: `Deleted pitch ${pitchId}`,
    });

    return NextResponse.json({ message: "Pitch deleted" });
  } catch (error) {
    console.error("Error deleting pitch:", error);
    return NextResponse.json({ error: "Failed to delete pitch" }, { status: 500 });
  }
}
