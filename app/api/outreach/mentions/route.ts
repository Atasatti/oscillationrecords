import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/mentions — recent comments that @-mention the current user
// (across all tasks), newest first, with the task title. Powers the reminders
// bell's Mentions section.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    // Comments store the mentioned/author user's real Mongo id (resolveUserId),
    // NOT token.sub — resolve the same id here or the feed never matches.
    const userId = await resolveUserId(guard.token);
    if (!userId) return NextResponse.json({ mentions: [] });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await prisma.taskComment.findMany({
      where: { mentions: { has: userId }, createdAt: { gte: since }, NOT: { authorId: userId } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const taskIds = [...new Set(rows.map((r) => r.taskId))];
    const tasks = taskIds.length
      ? await prisma.outreachTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } })
      : [];
    const titleById = new Map(tasks.map((t) => [t.id, t.title]));

    const mentions = rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      taskTitle: titleById.get(r.taskId) ?? "(deleted task)",
      authorEmail: r.authorEmail,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ mentions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("mentions GET error:", e);
    return NextResponse.json({ error: "Failed to load mentions" }, { status: 500 });
  }
}
