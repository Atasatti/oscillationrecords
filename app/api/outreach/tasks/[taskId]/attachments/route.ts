import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { deleteS3Object, isOwnBucketUrl, keyFromOwnBucketUrl } from "@/lib/s3";
import { isAllowedAttachmentType, normalizeAttachments, type Attachment } from "@/lib/task-attachments";

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

    const attachment: Attachment = {
      id: crypto.randomUUID(),
      name,
      url,
      size: typeof body.size === "number" && Number.isFinite(body.size) ? body.size : null,
      type,
    };

    // Append atomically in a single document update so two people attaching files
    // at the same time can't clobber each other — a read-modify-write on the whole
    // array lets the second write drop the first attachment, orphaning its S3
    // object. A single-document update is atomic in MongoDB, so no transaction is
    // needed; the pipeline also seeds the array when attachments is null/absent, the
    // $isArray guard tolerates a non-array value, and $literal keeps the
    // user-supplied fields from being evaluated as aggregation expressions.
    const result = (await prisma.$runCommandRaw({
      update: "OutreachTask",
      updates: [
        {
          q: { _id: { $oid: taskId } },
          u: [
            {
              $set: {
                attachments: {
                  $concatArrays: [
                    { $cond: [{ $isArray: "$attachments" }, "$attachments", []] },
                    { $literal: [attachment] },
                  ],
                },
              },
            },
          ],
        },
      ],
    } as unknown as Prisma.InputJsonObject)) as unknown as { n?: number };

    // n = documents matched; 0 means the task doesn't exist.
    if (!result?.n) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (e) {
    console.error("task attachments POST error:", e);
    return NextResponse.json({ error: "Failed to attach file" }, { status: 500 });
  }
}

// DELETE /api/outreach/tasks/[taskId]/attachments?attachmentId=… — remove the
// attachment record AND its S3 object.
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

    // Read the object key BEFORE dropping the record — once the array entry is
    // gone nothing points at the file, and an orphaned private object is still
    // billable and still readable by anyone holding a leaked key (audit #1).
    const existing = await prisma.outreachTask
      .findUnique({ where: { id: taskId }, select: { attachments: true } })
      .catch(() => null);
    const doomedUrl = normalizeAttachments(existing?.attachments).find(
      (a) => a.id === attachmentId
    )?.url;

    // Remove atomically in a single document update (see POST) — a read-filter-write
    // has the same lost-update risk under a concurrent add/delete. $filter drops the
    // matching attachment in place; $isArray tolerates a null/absent array and
    // $literal stops a crafted attachmentId being read as an expression (which could
    // otherwise make the condition always false and wipe every attachment).
    const result = (await prisma.$runCommandRaw({
      update: "OutreachTask",
      updates: [
        {
          q: { _id: { $oid: taskId } },
          u: [
            {
              $set: {
                attachments: {
                  $filter: {
                    input: { $cond: [{ $isArray: "$attachments" }, "$attachments", []] },
                    as: "a",
                    cond: { $ne: ["$$a.id", { $literal: attachmentId }] },
                  },
                },
              },
            },
          ],
        },
      ],
    } as unknown as Prisma.InputJsonObject)) as unknown as { n?: number };

    // n = documents matched; 0 means the task doesn't exist.
    if (!result?.n) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Best-effort sweep (deleteS3Object never throws); confined to the prefix this
    // route's uploads own, so a crafted record can't aim it at another object.
    const key = doomedUrl ? keyFromOwnBucketUrl(doomedUrl) : null;
    if (key?.startsWith("task-attachments/")) await deleteS3Object(key);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("task attachments DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove attachment" }, { status: 500 });
  }
}
