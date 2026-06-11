import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireUser, tokenIsAdmin } from "@/lib/auth-guard";
import {
  S3_BUCKET,
  isAudioContentType,
  publicFileUrl,
  s3Client,
  s3Configured,
  sanitizeKey,
} from "@/lib/s3";

// Force dynamic rendering - prevent static generation
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Non-admin uploads (the public Benert Remix competition) are confined to this prefix.
const PUBLIC_UPLOAD_PREFIX = "benert-remix/";

// POST /api/upload/presigned-urls - Get presigned URLs for audio (+ optional image).
// Admin: full catalog uploads (any key/type, incl. stems). Other signed-in users:
// audio only, confined to the competition prefix.
export async function POST(request: NextRequest) {
  try {
    const guard = await requireUser(request);
    if (!guard.ok) return guard.response;
    const isAdmin = tokenIsAdmin(guard.token);

    if (!s3Configured() || !s3Client) {
      return NextResponse.json(
        { error: "AWS credentials not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { audioFileName, audioFileType, imageFileName, imageFileType } = body;

    // Audio is required
    if (!audioFileName || !audioFileType) {
      return NextResponse.json(
        { error: "audioFileName and audioFileType are required" },
        { status: 400 }
      );
    }

    const audioKey = sanitizeKey(audioFileName);
    if (!audioKey) {
      return NextResponse.json({ error: "Invalid audioFileName" }, { status: 400 });
    }

    // Untrusted (non-admin) users may only upload audio into the competition prefix.
    if (!isAdmin) {
      if (!audioKey.startsWith(PUBLIC_UPLOAD_PREFIX)) {
        return NextResponse.json({ error: "Forbidden upload path" }, { status: 403 });
      }
      if (!isAudioContentType(audioFileType)) {
        return NextResponse.json(
          { error: "Only audio uploads are allowed" },
          { status: 400 }
        );
      }
    }

    const results: {
      audio: { uploadURL: string; fileURL: string };
      image?: { uploadURL: string; fileURL: string };
    } = {
      audio: { uploadURL: "", fileURL: "" },
    };

    const audioUploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: audioKey,
        ContentType: audioFileType,
      }),
      { expiresIn: 3600 }
    );

    results.audio = {
      uploadURL: audioUploadURL,
      fileURL: publicFileUrl(audioKey),
    };

    // Optional image is an admin-only convenience (the public flow never sends one).
    if (isAdmin && imageFileName && imageFileType) {
      const imageKey = sanitizeKey(imageFileName);
      if (!imageKey) {
        return NextResponse.json({ error: "Invalid imageFileName" }, { status: 400 });
      }
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
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error generating presigned URLs:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URLs" },
      { status: 500 }
    );
  }
}
