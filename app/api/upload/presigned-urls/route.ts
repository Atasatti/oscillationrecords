import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireUser, requireAdmin } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
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

// Non-admin uploads (the public Benert Remix competition) are confined to this prefix.
const PUBLIC_UPLOAD_PREFIX = "benert-remix/";

// POST /api/upload/presigned-urls - Get presigned URLs for audio (+ optional image).
// Admin: full catalog uploads (any key/type, incl. stems). Other signed-in users:
// audio only, confined to the competition prefix.
export async function POST(request: NextRequest) {
  try {
    const guard = await requireUser(request);
    if (!guard.ok) return guard.response;
    // Authoritative, DB-revocation-aware admin check (a demoted admin's stale JWT
    // must NOT keep the privileged upload path — token-only isAdmin wouldn't catch
    // that). Non-admins fall through to the confined competition path below.
    const adminGuard = await requireAdmin(request);
    const isAdmin = adminGuard.ok;

    if (!s3Configured() || !s3Client) {
      return NextResponse.json(
        { error: "AWS credentials not configured" },
        { status: 500 }
      );
    }

    // Rate-limit presign issuance per user for EVERY caller (admin included) to
    // curb storage/cost abuse from a compromised session.
    const rl = rateLimit(`presign:${guard.token.sub}`, isAdmin ? 60 : 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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

    // This route only ever mints audio object keys, so enforce an audio/* type for
    // EVERYONE (admins included). Without this, the admin branch would sign a PUT
    // bound to any client content-type — e.g. text/html or image/svg+xml served
    // from the public bucket and executed as script under the bucket origin.
    if (!isAudioContentType(audioFileType)) {
      return NextResponse.json(
        { error: "Only audio uploads are allowed" },
        { status: 400 }
      );
    }

    const sanitizedAudio = sanitizeKey(audioFileName);
    if (!sanitizedAudio) {
      return NextResponse.json({ error: "Invalid audioFileName" }, { status: 400 });
    }

    let audioKey = sanitizedAudio;

    // Untrusted (non-admin) users may only upload audio, and the SERVER owns the
    // key: we discard the client's path and force `benert-remix/<userId>/<name>`.
    // This stops an entrant from overwriting another's submission or writing
    // outside the competition prefix (the client just uses the returned fileURL).
    if (!isAdmin) {
      const base = sanitizeKey(sanitizedAudio.split("/").pop() || "");
      const safeSub = String(guard.token.sub || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
      if (!base || !safeSub) {
        return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
      }
      audioKey = `${PUBLIC_UPLOAD_PREFIX}${safeSub}/${base}`;
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
      // Raster images only — reject image/svg+xml (and non-image types): an SVG
      // served from the public bucket can execute script when navigated directly.
      if (!isImageContentType(imageFileType) || /svg/i.test(String(imageFileType))) {
        return NextResponse.json(
          { error: "Only raster image uploads are allowed" },
          { status: 400 }
        );
      }
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
