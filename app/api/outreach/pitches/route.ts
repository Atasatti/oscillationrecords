import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/pitches?page=&pageSize=&q=&status=
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "25", 10) || 25);
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [total, rows] = await Promise.all([
      prisma.pitchLog.count({ where }),
      prisma.pitchLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Resolve contact, artist, release names in parallel
    const contactIds = [...new Set(rows.map((r) => r.contactId))];
    const artistIds = [...new Set(rows.flatMap((r) => r.artistIds))];
    const releaseIds = [...new Set(rows.flatMap((r) => r.releaseIds))];

    const [contacts, artists, releases] = await Promise.all([
      contactIds.length
        ? prisma.outreachContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, outlet: true } })
        : [],
      artistIds.length
        ? prisma.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true, name: true } })
        : [],
      releaseIds.length
        ? prisma.release.findMany({ where: { id: { in: releaseIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    const artistMap = new Map(artists.map((a) => [a.id, a.name]));
    const releaseMap = new Map(releases.map((r) => [r.id, r.name]));

    const items = rows.map((row) => ({
      ...row,
      contact: contactMap.get(row.contactId) ?? { id: row.contactId, name: "Unknown", outlet: "" },
      artists: row.artistIds.map((id) => ({ id, name: artistMap.get(id) ?? "Unknown" })),
      releases: row.releaseIds.map((id) => ({ id, name: releaseMap.get(id) ?? "Unknown" })),
    }));

    return NextResponse.json({ items, total, page, pageSize }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching pitches:", error);
    return NextResponse.json({ error: "Failed to fetch pitches" }, { status: 500 });
  }
}

// POST /api/outreach/pitches
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { contactId, artistIds, releaseIds, status, sentAt, followUpDueAt, responseNotes, notes } = body;

    if (!contactId?.trim()) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    const contact = await prisma.outreachContact.findUnique({ where: { id: contactId } });
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 400 });

    const pitch = await prisma.pitchLog.create({
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

    // Update contact's lastContactedAt if the pitch has been sent
    if (status && status !== "not_sent") {
      await prisma.outreachContact.update({
        where: { id: contactId },
        data: { lastContactedAt: new Date(), relationshipStatus: "contacted" },
      });
    }

    return NextResponse.json(pitch, { status: 201 });
  } catch (error) {
    console.error("Error creating pitch:", error);
    return NextResponse.json({ error: "Failed to create pitch" }, { status: 500 });
  }
}
