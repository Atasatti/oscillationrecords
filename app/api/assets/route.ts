import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { resolveUserId } from "@/lib/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { deleteS3Object, headS3Object, isOwnBucketUrl, publicFileUrl } from "@/lib/s3";
import {
  ASSET_PREFIX,
  MAX_ASSET_BYTES,
  assetStr,
  isAllowedAssetType,
  isAssetCategory,
  objectIdOrNull,
} from "@/lib/asset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function releaseExists(id: string): Promise<boolean> {
  return !!(await prisma.release.findUnique({ where: { id }, select: { id: true } }));
}
async function artistExists(id: string): Promise<boolean> {
  return !!(await prisma.artist.findUnique({ where: { id }, select: { id: true } }));
}

// GET /api/assets — every asset, newest first.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const assets = await prisma.asset.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ assets }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("assets GET error:", e);
    return NextResponse.json({ error: "Failed to load assets" }, { status: 500 });
  }
}

// POST /api/assets — register an uploaded file. The client presigns + PUTs to S3
// first, then posts the fileKey here. We re-derive the URL from the key, confirm
// the object exists via HEAD (so size/type come from S3, not the client), and
// enforce the "assets/" prefix so only our own uploads can be registered.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;

  const rl = rateLimit(`asset-create:${guard.token.sub}`, 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json().catch(() => ({}));
    const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

    const fileKey = typeof o.fileKey === "string" ? o.fileKey : "";
    if (!fileKey.startsWith(ASSET_PREFIX) || fileKey.includes("..")) {
      return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
    }
    const fileUrl = publicFileUrl(fileKey);
    if (!isOwnBucketUrl(fileUrl)) {
      return NextResponse.json({ error: "Invalid file location" }, { status: 400 });
    }
    // One row per S3 object — so deleting an asset can't orphan a duplicate row
    // that shares the same underlying file.
    const dup = await prisma.asset.findFirst({ where: { fileKey }, select: { id: true } });
    if (dup) return NextResponse.json({ error: "That file is already in the library" }, { status: 409 });

    const fileName = assetStr(o.fileName, 300) ?? fileKey.split("/").pop() ?? "file";
    const title = assetStr(o.title, 300) ?? fileName;
    const category = isAssetCategory(o.category) ? o.category : "other";

    // Confirm the upload landed and read its true size/type.
    const head = await headS3Object(fileKey);
    if (!head) return NextResponse.json({ error: "Upload not found — try again" }, { status: 400 });
    // Re-validate the authoritative S3 content-type (defense in depth: presign is
    // the only other allowlist gate, and it's a separate endpoint).
    if (!isAllowedAssetType(head.contentType)) {
      await deleteS3Object(fileKey);
      return NextResponse.json({ error: "That file type isn't allowed" }, { status: 400 });
    }
    if (head.size > MAX_ASSET_BYTES) {
      await deleteS3Object(fileKey); // reject oversized uploads and clean up
      return NextResponse.json({ error: "File is too large" }, { status: 400 });
    }

    let releaseId = objectIdOrNull(o.releaseId);
    if (releaseId && !(await releaseExists(releaseId))) releaseId = null;
    let artistId = objectIdOrNull(o.artistId);
    if (artistId && !(await artistExists(artistId))) artistId = null;

    const uploadedById = await resolveUserId(guard.token);

    const asset = await prisma.asset.create({
      data: {
        category,
        title,
        fileName,
        fileKey,
        fileUrl,
        mimeType: head.contentType,
        size: head.size,
        releaseId,
        artistId,
        uploadedById,
        notes: assetStr(o.notes, 2000),
      },
    });
    await recordAudit(request, guard.token, {
      action: "create",
      resource: "asset",
      resourceId: asset.id,
      summary: `Uploaded asset "${asset.title}" (${asset.category})`,
      metadata: { category, size: head.size },
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (e) {
    console.error("assets POST error:", e);
    return NextResponse.json({ error: "Failed to save asset" }, { status: 500 });
  }
}
