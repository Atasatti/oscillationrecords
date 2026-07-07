import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import {
  contentStr,
  isContentPlatform,
  isContentStatus,
  normalizeReleaseId,
  safeUrl,
  toUtcDay,
} from "@/lib/content-post";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

async function releaseExists(id: string): Promise<boolean> {
  const rel = await prisma.release.findUnique({ where: { id }, select: { id: true } });
  return !!rel;
}

// PATCH /api/content/posts/[id] — partial update. Only the provided fields are
// touched (a full edit from the dialog, or a quick status/date drag).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("title" in o) {
      const s = contentStr(o.title, 200);
      if (!s) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      data.title = s;
    }
    if ("platform" in o) {
      if (!isContentPlatform(o.platform)) return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
      data.platform = o.platform;
    }
    if ("status" in o) {
      if (!isContentStatus(o.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      data.status = o.status;
    }
    if ("scheduledFor" in o) {
      const d = toUtcDay(o.scheduledFor);
      if (!d) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      data.scheduledFor = d;
    }
    if ("releaseId" in o) {
      const rid = normalizeReleaseId(o.releaseId);
      // Drop a link that doesn't resolve (display-only field, no hard relation).
      data.releaseId = rid && (await releaseExists(rid)) ? rid : null;
    }
    if ("copy" in o) data.copy = contentStr(o.copy, 5000);
    if ("assetLink" in o) data.assetLink = safeUrl(o.assetLink);
    if ("notes" in o) data.notes = contentStr(o.notes, 2000);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const post = await prisma.contentPost.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "content_post",
      resourceId: id,
      summary: `Updated "${post.title}"${data.status ? ` → ${data.status}` : ""}`,
      metadata: { status: data.status, platform: data.platform },
    });
    return NextResponse.json({ post });
  } catch (e) {
    console.error("content post PATCH error:", e);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

// DELETE /api/content/posts/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.contentPost.findUnique({ where: { id }, select: { title: true } });
    if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    await prisma.contentPost.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "content_post",
      resourceId: id,
      summary: `Deleted planned post "${existing.title}"`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("content post DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
