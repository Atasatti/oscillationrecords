import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requirePermission } from "@/lib/auth-guard";
import { rateLimitShared } from "@/lib/rate-limit-shared";
import { S3_BUCKET, parseUploadSize, s3Client, s3Configured, sanitizeKey, publicFileUrl } from "@/lib/s3";
import { ASSET_PREFIX, isAllowedAssetType, isAssetCategory, MAX_ASSET_BYTES } from "@/lib/asset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/assets/presign { fileName, fileType, category } — presigned PUT URL
// for an asset upload. Catalog-gated. Allowlisted content types only (no SVG/
// HTML). The server owns the key: assets/{category}/{uuid}/{basename}.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;

  if (!s3Configured() || !s3Client) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }

  const rl = await rateLimitShared(`asset-upload:${guard.token.sub}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json().catch(() => ({}));
    const fileType = typeof body.fileType === "string" ? body.fileType : "";
    if (!isAllowedAssetType(fileType)) {
      return NextResponse.json({ error: "That file type isn't allowed" }, { status: 400 });
    }
    const category = isAssetCategory(body.category) ? body.category : "other";
    const base = sanitizeKey(String(body.fileName || "").split(/[\\/]/).pop() || "");
    if (!base) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    const fileKey = `${ASSET_PREFIX}${category}/${crypto.randomUUID()}/${base}`;

    // Sign-time size binding (1 GB): S3 rejects a mismatched Content-Length.
    const size = parseUploadSize(body.size, MAX_ASSET_BYTES);
    if (size === null) {
      return NextResponse.json({ error: "size (bytes, up to 1 GB) is required" }, { status: 400 });
    }

    const uploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: fileKey, ContentType: fileType, ContentLength: size }),
      { expiresIn: 900 }
    );

    return NextResponse.json({ uploadURL, fileURL: publicFileUrl(fileKey), fileKey });
  } catch (e) {
    console.error("asset presign error:", e);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
