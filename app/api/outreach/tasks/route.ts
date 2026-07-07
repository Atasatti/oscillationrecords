import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isRecurrence } from "@/lib/task-recurrence";
import { normalizeChecklist } from "@/lib/task-checklist";
import { normalizeTags } from "@/lib/task-tags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/tasks?status=&category=&isTemplate=
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission(request, "outreach:read");
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const category = searchParams.get("category") || "";
    const assigneeId = searchParams.get("assigneeId");
    const releaseId = searchParams.get("releaseId");
    const artistId = searchParams.get("artistId");
    const isTemplate = searchParams.get("isTemplate");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;
    // assigneeId=none → unassigned tasks; a specific id → that assignee's tasks.
    if (assigneeId === "none") where.assigneeId = null;
    else if (assigneeId) where.assigneeId = assigneeId;
    // Rollup filters: tasks linked to a given release / artist.
    if (releaseId) where.releaseIds = { has: releaseId };
    if (artistId) where.artistIds = { has: artistId };
    if (isTemplate !== null) where.isTemplate = isTemplate === "true";

    const tasks = await prisma.outreachTask.findMany({
      where,
      orderBy: [
        { status: "asc" },
        { priority: "asc" },
        { dueAt: "asc" },
        { createdAt: "desc" },
      ],
    });

    // Attach a comment count per task (one groupBy, no N+1) so rows can show it.
    const ids = tasks.map((t) => t.id);
    const counts = ids.length
      ? await prisma.taskComment.groupBy({ by: ["taskId"], where: { taskId: { in: ids } }, _count: { _all: true } })
      : [];
    const countByTask = new Map(counts.map((c) => [c.taskId, c._count._all]));
    const items = tasks.map((t) => ({ ...t, commentCount: countByTask.get(t.id) ?? 0 }));

    return NextResponse.json({ items, total: items.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// POST /api/outreach/tasks
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { title, description, category, priority, status, assigneeId, recurrence, checklist, tags, artistIds, releaseIds, dueAt, notes, isTemplate } = body;

    if (!title?.trim() || !category?.trim()) {
      return NextResponse.json({ error: "title and category are required" }, { status: 400 });
    }

    const task = await prisma.outreachTask.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        category: category.trim(),
        priority: priority || "medium",
        status: status || "todo",
        assigneeId: typeof assigneeId === "string" && assigneeId.trim() ? assigneeId.trim() : null,
        recurrence: isRecurrence(recurrence) ? recurrence : null,
        checklist: normalizeChecklist(checklist) as unknown as Prisma.InputJsonValue,
        tags: normalizeTags(tags),
        artistIds: Array.isArray(artistIds) ? artistIds : [],
        releaseIds: Array.isArray(releaseIds) ? releaseIds : [],
        dueAt: dueAt ? new Date(dueAt) : null,
        notes: notes?.trim() || null,
        isTemplate: isTemplate === true,
      },
    });

    await recordAudit(request, guard.token, {
      action: "create",
      resource: "task",
      resourceId: task.id,
      summary: `Created task "${task.title}"`,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
