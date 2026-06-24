import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/tasks?status=&category=&isTemplate=
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const category = searchParams.get("category") || "";
    const isTemplate = searchParams.get("isTemplate");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;
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

    return NextResponse.json({ items: tasks, total: tasks.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// POST /api/outreach/tasks
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { title, description, category, priority, status, artistIds, releaseIds, dueAt, notes, isTemplate } = body;

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
        artistIds: Array.isArray(artistIds) ? artistIds : [],
        releaseIds: Array.isArray(releaseIds) ? releaseIds : [],
        dueAt: dueAt ? new Date(dueAt) : null,
        notes: notes?.trim() || null,
        isTemplate: isTemplate === true,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
