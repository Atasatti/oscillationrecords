import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/contacts?page=&pageSize=&q=&type=&status=
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "25", 10) || 25);
    const q = searchParams.get("q")?.trim() || "";
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.relationshipStatus = status;

    let rows = await prisma.outreachContact.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
    });

    if (q) {
      const lower = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(lower) ||
          r.outlet.toLowerCase().includes(lower) ||
          (r.contactEmail ?? "").toLowerCase().includes(lower)
      );
    }

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize);

    // Attach pitch count per contact
    const contactIds = paged.map((c) => c.id);
    const pitchCounts = await prisma.pitchLog.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds } },
      _count: { _all: true },
    });
    const countMap = new Map(pitchCounts.map((p) => [p.contactId, p._count._all]));

    const items = paged.map((c) => ({ ...c, pitchCount: countMap.get(c.id) ?? 0 }));

    return NextResponse.json({ items, total, page, pageSize }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching outreach contacts:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

// POST /api/outreach/contacts
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, outlet, type, contactEmail, contactUrl, genreFocus, notes } = body;

    if (!name?.trim() || !outlet?.trim() || !type?.trim()) {
      return NextResponse.json({ error: "name, outlet and type are required" }, { status: 400 });
    }

    const contact = await prisma.outreachContact.create({
      data: {
        name: name.trim(),
        outlet: outlet.trim(),
        type: type.trim(),
        contactEmail: contactEmail?.trim() || null,
        contactUrl: contactUrl?.trim() || null,
        genreFocus: Array.isArray(genreFocus) ? genreFocus : [],
        notes: notes?.trim() || null,
        relationshipStatus: "cold",
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("Error creating outreach contact:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
