import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/contacts/[contactId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { contactId } = await params;
    const contact = await prisma.outreachContact.findUnique({ where: { id: contactId } });
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json(contact);
  } catch (error) {
    console.error("Error fetching contact:", error);
    return NextResponse.json({ error: "Failed to fetch contact" }, { status: 500 });
  }
}

// PUT /api/outreach/contacts/[contactId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { contactId } = await params;
    const body = await request.json();
    const { name, outlet, type, contactEmail, contactUrl, genreFocus, relationshipStatus, notes } = body;

    if (!name?.trim() || !outlet?.trim() || !type?.trim()) {
      return NextResponse.json({ error: "name, outlet and type are required" }, { status: 400 });
    }

    const existing = await prisma.outreachContact.findUnique({ where: { id: contactId } });
    if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    const contact = await prisma.outreachContact.update({
      where: { id: contactId },
      data: {
        name: name.trim(),
        outlet: outlet.trim(),
        type: type.trim(),
        contactEmail: contactEmail?.trim() || null,
        contactUrl: contactUrl?.trim() || null,
        genreFocus: Array.isArray(genreFocus) ? genreFocus : [],
        relationshipStatus: relationshipStatus || existing.relationshipStatus,
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

// PATCH /api/outreach/contacts/[contactId] — update relationshipStatus only
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { contactId } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (typeof body.relationshipStatus === "string") data.relationshipStatus = body.relationshipStatus;
    if (body.lastContactedAt !== undefined) data.lastContactedAt = body.lastContactedAt ? new Date(body.lastContactedAt) : null;

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const existing = await prisma.outreachContact.findUnique({ where: { id: contactId } });
    if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    const contact = await prisma.outreachContact.update({ where: { id: contactId }, data });
    return NextResponse.json(contact);
  } catch (error) {
    console.error("Error patching contact:", error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

// DELETE /api/outreach/contacts/[contactId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { contactId } = await params;
    const existing = await prisma.outreachContact.findUnique({ where: { id: contactId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    await prisma.outreachContact.delete({ where: { id: contactId } });
    return NextResponse.json({ message: "Contact deleted" });
  } catch (error) {
    console.error("Error deleting contact:", error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
