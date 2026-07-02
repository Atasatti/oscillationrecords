import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// GET /api/outreach/mentions — recent comments that @-mention the current user
// (across all tasks), newest first, with the task title. Powers the reminders
// bell's Mentions section.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const sub = typeof guard.token.sub === "string" ? guard.token.sub : null;
    if (!sub || !OBJECT_ID.test(sub)) return NextResponse.json({ mentions: [] });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await prisma.taskComment.findMany({
      where: { mentions: { has: sub }, createdAt: { gte: since }, NOT: { authorId: sub } },
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
