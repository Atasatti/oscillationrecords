import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// GET /api/outreach/tasks/[taskId]/comments — the task's comment thread (oldest first).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const { taskId } = await params;
    // Resolve the caller's real Mongo user id (token.sub is the Google OAuth
    // subject, NOT our id) so we can flag each comment the caller owns — the client
    // shows the delete affordance on `mine`, and DELETE enforces the same ownership.
    const [comments, userId] = await Promise.all([
      prisma.taskComment.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } }),
      resolveUserId(guard.token),
    ]);
    return NextResponse.json(
      { comments: comments.map((c) => ({ ...c, mine: !!userId && c.authorId === userId })) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("task comments GET error:", e);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

// POST /api/outreach/tasks/[taskId]/comments { body } — add a comment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { taskId } = await params;
    const raw = await request.json().catch(() => ({}));
    const body = typeof raw.body === "string" ? raw.body.trim().slice(0, 5000) : "";
    if (!body) return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
    // Mentioned staff ids (matched client-side from @tokens); validate as ObjectIds.
    const mentions: string[] = Array.isArray(raw.mentions)
      ? [...new Set((raw.mentions as unknown[]).filter((m): m is string => typeof m === "string" && OBJECT_ID.test(m)))]
      : [];

    // Confirm the task exists (avoid orphan comments).
    const task = await prisma.outreachTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Store the caller's real Mongo user id (resolveUserId; token.sub is the Google
    // OAuth subject, not our id) so ownership checks and author attribution work.
    const authorId = await resolveUserId(guard.token);
    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        authorId,
        authorEmail: typeof guard.token.email === "string" ? guard.token.email : null,
        body,
        mentions,
      },
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (e) {
    console.error("task comments POST error:", e);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}

// DELETE /api/outreach/tasks/[taskId]/comments?commentId=… — delete your OWN comment.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { taskId } = await params;
    const commentId = new URL(request.url).searchParams.get("commentId") || "";
    if (!commentId) return NextResponse.json({ error: "commentId is required" }, { status: 400 });

    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.taskId !== taskId) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    // Only the author can delete their own comment — compare the real Mongo user id
    // (resolveUserId), matching how authorId is stored on create.
    const userId = await resolveUserId(guard.token);
    if (!userId || comment.authorId !== userId) {
      return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
    }

    await prisma.taskComment.delete({ where: { id: commentId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("task comments DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
