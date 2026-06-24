import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/pitches/[pitchId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pitchId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
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
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { pitchId } = await params;
    const body = await request.json();
    const { contactId, artistIds, releaseIds, status, sentAt, followUpDueAt, responseNotes, notes } = body;

    if (!contactId?.trim()) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    const existing = await prisma.pitchLog.findUnique({ where: { id: pitchId } });
    if (!existing) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });

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

    // Sync contact status when pitch is accepted or responded to
    if (status === "accepted") {
      await prisma.outreachContact.update({
        where: { id: contactId },
        data: { relationshipStatus: "published", lastContactedAt: new Date() },
      });
    } else if (status === "followed_up" || status === "sent") {
      await prisma.outreachContact.update({
        where: { id: contactId },
        data: { lastContactedAt: new Date(), relationshipStatus: "contacted" },
      });
    }

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
    const guard = await requireAdmin(request);
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

    // Sync contact relationship status
    if (body.status === "accepted") {
      await prisma.outreachContact.update({
        where: { id: existing.contactId },
        data: { relationshipStatus: "published", lastContactedAt: new Date() },
      });
    } else if (body.status === "sent" || body.status === "followed_up") {
      await prisma.outreachContact.update({
        where: { id: existing.contactId },
        data: { lastContactedAt: new Date(), relationshipStatus: "contacted" },
      });
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
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { pitchId } = await params;
    const existing = await prisma.pitchLog.findUnique({ where: { id: pitchId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });

    await prisma.pitchLog.delete({ where: { id: pitchId } });
    return NextResponse.json({ message: "Pitch deleted" });
  } catch (error) {
    console.error("Error deleting pitch:", error);
    return NextResponse.json({ error: "Failed to delete pitch" }, { status: 500 });
  }
}
