import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isClearlyPastDue, PAST_DUE_ERROR } from "@/lib/task-due-date";
import { normalizeChecklist } from "@/lib/task-checklist";
import { normalizeTags } from "@/lib/task-tags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/tasks/[taskId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:read");
    if (!guard.ok) return guard.response;

    const { taskId } = await params;
    const task = await prisma.outreachTask.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

// PUT /api/outreach/tasks/[taskId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { taskId } = await params;
    const body = await request.json();
    const { title, description, category, priority, status, assigneeId, checklist, tags, artistIds, releaseIds, dueAt, notes } = body;

    if (!title?.trim() || !category?.trim()) {
      return NextResponse.json({ error: "title and category are required" }, { status: 400 });
    }

    const existing = await prisma.outreachTask.findUnique({ where: { id: taskId } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Rescheduling to the past is rejected — but ONLY when the date actually
    // changes. An overdue task must stay editable (title, status, notes…) while
    // keeping its original, already-past due date; clearing the date is fine too.
    const sameDay =
      Boolean(dueAt) &&
      Boolean(existing.dueAt) &&
      new Date(String(dueAt)).toISOString().slice(0, 10) ===
        existing.dueAt!.toISOString().slice(0, 10);
    if (dueAt && !sameDay && isClearlyPastDue(dueAt)) {
      return NextResponse.json({ error: PAST_DUE_ERROR }, { status: 400 });
    }

    const task = await prisma.outreachTask.update({
      where: { id: taskId },
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        category: category.trim(),
        priority: priority || "medium",
        status: status || "todo",
        assigneeId: typeof assigneeId === "string" && assigneeId.trim() ? assigneeId.trim() : null,
        // Recurrence retired: completing a task no longer spawns a duplicate "todo".
        recurrence: null,
        checklist: normalizeChecklist(checklist) as unknown as Prisma.InputJsonValue,
        tags: normalizeTags(tags),
        artistIds: Array.isArray(artistIds) ? artistIds : [],
        releaseIds: Array.isArray(releaseIds) ? releaseIds : [],
        dueAt: dueAt ? new Date(dueAt) : null,
        notes: notes?.trim() || null,
      },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "task",
      resourceId: task.id,
      summary: `Updated task "${task.title}"`,
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// PATCH /api/outreach/tasks/[taskId] — status change only
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { taskId } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") data.status = body.status;
    if (typeof body.priority === "string") data.priority = body.priority;
    // assigneeId: a non-empty string sets the assignee; null / "" clears it.
    if ("assigneeId" in body) {
      data.assigneeId = typeof body.assigneeId === "string" && body.assigneeId.trim() ? body.assigneeId.trim() : null;
    }
    // checklist: full array replace (used by inline item toggling on a row).
    if ("checklist" in body) {
      data.checklist = normalizeChecklist(body.checklist) as unknown as Prisma.InputJsonValue;
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const existing = await prisma.outreachTask.findUnique({ where: { id: taskId } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await prisma.outreachTask.update({ where: { id: taskId }, data });

    // Record the meaningful state changes so inline edits — completing a task via
    // the checkbox, board drag-and-drop, reprioritising or reassigning on a row —
    // land in the audit trail like the full-form PUT and DELETE already do. A
    // checklist-only tick is intentionally skipped to keep the log from flooding.
    const changes: string[] = [];
    if (typeof data.status === "string" && data.status !== existing.status) {
      changes.push(
        data.status === "done"
          ? "marked done"
          : existing.status === "done"
            ? "reopened"
            : `status → ${data.status}`
      );
    }
    if (typeof data.priority === "string" && data.priority !== existing.priority) {
      changes.push(`priority → ${data.priority}`);
    }
    if ("assigneeId" in data && (data.assigneeId ?? null) !== (existing.assigneeId ?? null)) {
      changes.push(data.assigneeId ? "reassigned" : "unassigned");
    }
    if (changes.length) {
      await recordAudit(request, guard.token, {
        action: "update",
        resource: "task",
        resourceId: task.id,
        summary: `Task "${task.title}" — ${changes.join(", ")}`,
        metadata: {
          before: { status: existing.status, priority: existing.priority, assigneeId: existing.assigneeId },
          after: { status: task.status, priority: task.priority, assigneeId: task.assigneeId },
        },
      });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error patching task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// DELETE /api/outreach/tasks/[taskId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const guard = await requirePermission(request, "outreach:write");
    if (!guard.ok) return guard.response;

    const { taskId } = await params;
    const existing = await prisma.outreachTask.findUnique({ where: { id: taskId }, select: { id: true, title: true } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await prisma.outreachTask.delete({ where: { id: taskId } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "task",
      resourceId: taskId,
      summary: `Deleted task "${existing.title}"`,
    });
    return NextResponse.json({ message: "Task deleted" });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
