import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// GET /api/contact/[id]/replies — the ticket's reply/notes thread (oldest first).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const replies = await prisma.messageReply.findMany({ where: { messageId: id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ replies }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("message replies GET error:", e);
    return NextResponse.json({ error: "Failed to load replies" }, { status: 500 });
  }
}

// POST /api/contact/[id]/replies { body } — add a reply/note.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const raw = await request.json().catch(() => ({}));
    const body = typeof raw.body === "string" ? raw.body.trim().slice(0, 5000) : "";
    if (!body) return NextResponse.json({ error: "Reply can't be empty" }, { status: 400 });

    const message = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
    if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const authorId = await resolveUserId(guard.token);
    const reply = await prisma.messageReply.create({
      data: {
        messageId: id,
        authorId,
        authorEmail: typeof guard.token.email === "string" ? guard.token.email : null,
        body,
      },
    });
    return NextResponse.json({ reply }, { status: 201 });
  } catch (e) {
    console.error("message replies POST error:", e);
    return NextResponse.json({ error: "Failed to add reply" }, { status: 500 });
  }
}

// DELETE /api/contact/[id]/replies?replyId=… — delete your OWN reply.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const replyId = new URL(request.url).searchParams.get("replyId") || "";
    if (!isObjectId(replyId)) return NextResponse.json({ error: "replyId is required" }, { status: 400 });

    const reply = await prisma.messageReply.findUnique({ where: { id: replyId } });
    if (!reply || reply.messageId !== id) return NextResponse.json({ error: "Reply not found" }, { status: 404 });

    const userId = await resolveUserId(guard.token);
    if (!userId || reply.authorId !== userId) {
      return NextResponse.json({ error: "You can only delete your own replies." }, { status: 403 });
    }
    await prisma.messageReply.delete({ where: { id: replyId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("message replies DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete reply" }, { status: 500 });
  }
}
