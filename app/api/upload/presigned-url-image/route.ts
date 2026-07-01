import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAdmin } from "@/lib/auth-guard";
import {
  S3_BUCKET,
  isImageContentType,
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
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    if (!s3Configured() || !s3Client) {
      return NextResponse.json(
        { error: "AWS credentials not configured" },
        { status: 500 }
      );
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

    // Raster images only — reject image/svg+xml (and non-image types): an SVG
    // served from the public bucket can execute script when navigated directly.
    if (!isImageContentType(imageFileType) || /svg/i.test(String(imageFileType))) {
      return NextResponse.json(
        { error: "imageFileType must be a raster image/* content type" },
        { status: 400 }
      );
    }

    const uploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: imageFileType,
      }),
      { expiresIn: 3600 }
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
