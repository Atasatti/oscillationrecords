import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requirePermission } from "@/lib/auth-guard";
import { rateLimitShared } from "@/lib/rate-limit-shared";
import {
  S3_BUCKET,
  CATALOG_IMAGE_PREFIXES,
  isImageContentType,
  keyHasPrefix,
  MAX_IMAGE_UPLOAD_BYTES,
  parseUploadSize,
  publicFileUrl,
  s3Client,
  s3Configured,
  sanitizeKey,
} from "@/lib/s3";

// Force dynamic rendering - prevent static generation
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    if (!s3Configured() || !s3Client) {
      return NextResponse.json(
        { error: "AWS credentials not configured" },
        { status: 500 }
      );
    }

    // Per-user presign rate-limit (curbs storage/cost abuse from a compromised
    // catalog session), matching the sibling presigned-urls / task-attachment routes.
    const rl = await rateLimitShared(`presign-img:${guard.token.sub}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const { imageFileName, imageFileType } = body;

    if (!imageFileName || !imageFileType) {
      return NextResponse.json(
        { error: "imageFileName and imageFileType are required" },
        { status: 400 }
      );
    }

    const key = sanitizeKey(imageFileName);
    if (!key) {
      return NextResponse.json({ error: "Invalid imageFileName" }, { status: 400 });
    }
    // Confine the client-supplied key to catalog image namespaces so a catalog
    // session can't sign a PUT to an arbitrary bucket key (#26).
    if (!keyHasPrefix(key, CATALOG_IMAGE_PREFIXES)) {
      return NextResponse.json({ error: "imageFileName must be under an allowed path" }, { status: 400 });
    }

    // Raster images only — reject image/svg+xml (and non-image types): an SVG
    // served from the public bucket can execute script when navigated directly.
    if (!isImageContentType(imageFileType) || /svg/i.test(String(imageFileType))) {
      return NextResponse.json(
        { error: "imageFileType must be a raster image/* content type" },
        { status: 400 }
      );
    }

    // Sign-time size binding: S3 rejects a PUT whose Content-Length differs
    // from the declared size, so the cap cannot be stripped client-side.
    const size = parseUploadSize(body.size, MAX_IMAGE_UPLOAD_BYTES);
    if (size === null) {
      return NextResponse.json(
        { error: "size (bytes, up to 25 MB) is required" },
        { status: 400 }
      );
    }

    const uploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: imageFileType,
        ContentLength: size,
      }),
      { expiresIn: 900 }
    );

    return NextResponse.json({
      uploadURL,
      fileURL: publicFileUrl(key),
    });
  } catch (error) {
    console.error("Error generating presigned URL for image:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
