import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/tasks/[taskId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
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
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { taskId } = await params;
    const body = await request.json();
    const { title, description, category, priority, status, artistIds, releaseIds, dueAt, notes } = body;

    if (!title?.trim() || !category?.trim()) {
      return NextResponse.json({ error: "title and category are required" }, { status: 400 });
    }

    const existing = await prisma.outreachTask.findUnique({ where: { id: taskId } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await prisma.outreachTask.update({
      where: { id: taskId },
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        category: category.trim(),
        priority: priority || "medium",
        status: status || "todo",
        artistIds: Array.isArray(artistIds) ? artistIds : [],
        releaseIds: Array.isArray(releaseIds) ? releaseIds : [],
        dueAt: dueAt ? new Date(dueAt) : null,
        notes: notes?.trim() || null,
      },
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
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { taskId } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") data.status = body.status;
    if (typeof body.priority === "string") data.priority = body.priority;

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const existing = await prisma.outreachTask.findUnique({ where: { id: taskId } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await prisma.outreachTask.update({ where: { id: taskId }, data });
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
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { taskId } = await params;
    const existing = await prisma.outreachTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await prisma.outreachTask.delete({ where: { id: taskId } });
    return NextResponse.json({ message: "Task deleted" });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
