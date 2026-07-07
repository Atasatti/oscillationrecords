import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { isOwnBucketUrl } from "@/lib/s3";
import { normalizeAttachments, isAllowedAttachmentType, type Attachment } from "@/lib/task-attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/outreach/tasks/[taskId]/attachments { name, url, size?, type }
// Record an uploaded file (already PUT to our S3) against the task.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { taskId } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 300) : "";
    const url = typeof body.url === "string" ? body.url : "";
    const type = typeof body.type === "string" ? body.type : "";
    // Only accept a file on OUR bucket with an allowed type (defense in depth).
    if (!name || !isOwnBucketUrl(url) || !isAllowedAttachmentType(type)) {
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
    }

    const task = await prisma.outreachTask.findUnique({ where: { id: taskId }, select: { attachments: true } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const attachment: Attachment = {
      id: crypto.randomUUID(),
      name,
      url,
      size: typeof body.size === "number" && Number.isFinite(body.size) ? body.size : null,
      type,
    };
    const next = [...normalizeAttachments(task.attachments), attachment];
    await prisma.outreachTask.update({
      where: { id: taskId },
      data: { attachments: next as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (e) {
    console.error("task attachments POST error:", e);
    return NextResponse.json({ error: "Failed to attach file" }, { status: 500 });
  }
}

// DELETE /api/outreach/tasks/[taskId]/attachments?attachmentId=… — remove the
// attachment record (the S3 object is left in place).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { taskId } = await params;
    const attachmentId = new URL(request.url).searchParams.get("attachmentId") || "";
    if (!attachmentId) return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });

    const task = await prisma.outreachTask.findUnique({ where: { id: taskId }, select: { attachments: true } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const next = normalizeAttachments(task.attachments).filter((a) => a.id !== attachmentId);
    await prisma.outreachTask.update({
      where: { id: taskId },
      data: { attachments: next as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("task attachments DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove attachment" }, { status: 500 });
  }
}
