import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAdmin } from "@/lib/auth-guard";
import {
  S3_BUCKET,
  isAudioContentType,
  isImageContentType,
  publicFileUrl,
  s3Client,
  s3Configured,
  sanitizeKey,
} from "@/lib/s3";

// Force dynamic rendering - prevent static generation
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/upload/presigned-urls-bulk - Get presigned URLs for albums/EPs with multiple audio files (admin only)
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
    const {
      imageFileName,
      imageFileType,
      audioFiles, // Array of { fileName, fileType }
    } = body;

    if (!imageFileName || !imageFileType) {
      return NextResponse.json(
        { error: "imageFileName and imageFileType are required" },
        { status: 400 }
      );
    }

    if (!audioFiles || !Array.isArray(audioFiles) || audioFiles.length === 0) {
      return NextResponse.json(
        { error: "audioFiles array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (!isImageContentType(imageFileType)) {
      return NextResponse.json(
        { error: "imageFileType must be an image/* content type" },
        { status: 400 }
      );
    }

    const imageKey = sanitizeKey(imageFileName);
    if (!imageKey) {
      return NextResponse.json({ error: "Invalid imageFileName" }, { status: 400 });
    }

    const results: {
      image: { uploadURL: string; fileURL: string };
      audioFiles: Array<{ uploadURL: string; fileURL: string; fileName: string }>;
    } = {
      image: { uploadURL: "", fileURL: "" },
      audioFiles: [],
    };

    const imageUploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: imageKey,
        ContentType: imageFileType,
      }),
      { expiresIn: 3600 }
    );

    results.image = {
      uploadURL: imageUploadURL,
      fileURL: publicFileUrl(imageKey),
    };

    results.audioFiles = await Promise.all(
      audioFiles.map(
        async ({ fileName, fileType }: { fileName: string; fileType: string }) => {
          if (!fileName || !fileType) {
            throw new Error("Each audio file must have fileName and fileType");
          }
          if (!isAudioContentType(fileType)) {
            throw new Error("Each audio file must have an audio/* content type");
          }
          const key = sanitizeKey(fileName);
          if (!key) {
            throw new Error("Invalid audio fileName");
          }

          const uploadURL = await getSignedUrl(
            s3Client!,
            new PutObjectCommand({
              Bucket: S3_BUCKET,
              Key: key,
              ContentType: fileType,
            }),
            { expiresIn: 3600 }
          );

          return {
            uploadURL,
            fileURL: publicFileUrl(key),
            fileName,
          };
        }
      )
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error generating presigned URLs:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URLs" },
      { status: 500 }
    );
  }
}
