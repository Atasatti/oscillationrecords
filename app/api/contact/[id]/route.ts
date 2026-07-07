import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import {
  isTicketStatus,
  isTicketPriority,
  handledFromStatus,
  statusFromHandled,
} from "@/lib/contact-ticket";

export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// PATCH /api/contact/[id] — outreach: triage a contact message. Accepts any of
// { status, assigneeId, priority, handled }. `handled` is kept in sync with
// status (resolved == handled) so the needs-attention "unread" count still works.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { id } = await params;
    if (!isObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      handled?: unknown;
      status?: unknown;
      assigneeId?: unknown;
      priority?: unknown;
    };

    const data: {
      handled?: boolean;
      status?: string;
      assigneeId?: string | null;
      priority?: string;
    } = {};

    // Status drives handled; a legacy `handled` boolean drives status.
    if (isTicketStatus(body.status)) {
      data.status = body.status;
      data.handled = handledFromStatus(body.status);
    } else if (typeof body.handled === "boolean") {
      data.handled = body.handled;
      data.status = statusFromHandled(body.handled);
    }

    if (isTicketPriority(body.priority)) {
      data.priority = body.priority;
    }

    // assigneeId: an ObjectId assigns; null / "" clears; undefined leaves as-is.
    if (body.assigneeId === null || body.assigneeId === "") {
      data.assigneeId = null;
    } else if (typeof body.assigneeId === "string" && isObjectId(body.assigneeId)) {
      data.assigneeId = body.assigneeId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.contactMessage.update({ where: { id }, data });
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
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { id } = await params;
    if (!isObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.contactMessage.findUnique({
      where: { id },
      select: { name: true, email: true },
    });

    await prisma.contactMessage.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "message",
      resourceId: id,
      summary: `Deleted contact message from ${existing?.name || existing?.email || id}`,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
