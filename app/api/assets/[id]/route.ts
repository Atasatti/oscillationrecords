import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { deleteS3Object } from "@/lib/s3";
import { ASSET_PREFIX, assetStr, isAssetCategory, objectIdOrNull } from "@/lib/asset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function releaseExists(id: string): Promise<boolean> {
  return !!(await prisma.release.findUnique({ where: { id }, select: { id: true } }));
}
async function artistExists(id: string): Promise<boolean> {
  return !!(await prisma.artist.findUnique({ where: { id }, select: { id: true } }));
}

// PATCH /api/assets/[id] — edit metadata only (title/category/links/notes). The
// stored file itself is immutable; re-upload for a new file.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!objectIdOrNull(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("title" in o) {
      const s = assetStr(o.title, 300);
      if (!s) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      data.title = s;
    }
    if ("category" in o) {
      if (!isAssetCategory(o.category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      data.category = o.category;
    }
    if ("releaseId" in o) {
      const rid = objectIdOrNull(o.releaseId);
      data.releaseId = rid && (await releaseExists(rid)) ? rid : null;
    }
    if ("artistId" in o) {
      const aid = objectIdOrNull(o.artistId);
      data.artistId = aid && (await artistExists(aid)) ? aid : null;
    }
    if ("notes" in o) data.notes = assetStr(o.notes, 2000);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const asset = await prisma.asset.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "asset",
      resourceId: id,
      summary: `Updated asset "${asset.title}"`,
      metadata: { category: data.category },
    });
    return NextResponse.json({ asset });
  } catch (e) {
    console.error("asset PATCH error:", e);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
}

// DELETE /api/assets/[id] — remove the row and the S3 object.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!objectIdOrNull(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.asset.findUnique({
      where: { id },
      select: { title: true, fileKey: true },
    });
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // Delete the S3 object first (only ever our own "assets/" keys), then the
    // row. If the object delete fails it's logged but non-fatal — we still remove
    // the record so the library doesn't show a dangling entry; the audit records
    // whether the object was removed so an orphan can be swept later.
    const s3Removed = existing.fileKey.startsWith(ASSET_PREFIX)
      ? await deleteS3Object(existing.fileKey)
      : false;
    await prisma.asset.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "asset",
      resourceId: id,
      summary: `Deleted asset "${existing.title}"`,
      metadata: { fileKey: existing.fileKey, s3Removed },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("asset DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
  }
}
