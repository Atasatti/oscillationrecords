import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// PATCH /api/contact/[id] — admin-only: mark a contact message handled / unhandled.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { id } = await params;
    if (!isObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { handled?: unknown };
    const handled = body.handled === true;

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { handled },
    });
    return NextResponse.json({ message: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}

// DELETE /api/contact/[id] — admin-only: remove a contact message.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { id } = await params;
    if (!isObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await prisma.contactMessage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
