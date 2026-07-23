import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireUser, requirePermission } from "@/lib/auth-guard";
import { rateLimitShared } from "@/lib/rate-limit-shared";
import {
  S3_BUCKET,
  benertUserKeyPrefix,
  CATALOG_AUDIO_PREFIXES,
  CATALOG_IMAGE_PREFIXES,
  isAudioContentType,
  isImageContentType,
  keyHasPrefix,
  MAX_CATALOG_AUDIO_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  parseUploadSize,
  publicFileUrl,
  s3Client,
  s3Configured,
  sanitizeKey,
} from "@/lib/s3";

// Presigned PUTs are minted moments before the browser starts uploading, so a
// short validity window costs nothing and shrinks how long a leaked URL works.
// (The upload only has to START before expiry; an in-flight PUT completes.)
const PRESIGN_EXPIRY_S = 900;

// Force dynamic rendering - prevent static generation
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Non-admin uploads (the public Benert Remix competition) are confined to the
// entrant's own `benert-remix/<sub>/` prefix — see benertUserKeyPrefix().
// Hard size cap for a competition upload, matched to upload-complete's MAX_AUDIO_BYTES.
// Signed into the presign as an exact Content-Length so an entrant can neither
// declare nor PUT more than this (#6).
const MAX_COMPETITION_AUDIO_BYTES = 200 * 1024 * 1024;

// POST /api/upload/presigned-urls - Get presigned URLs for audio (+ optional image).
// Admin: full catalog uploads (any key/type, incl. stems). Other signed-in users:
// audio only, confined to the competition prefix.
export async function POST(request: NextRequest) {
  try {
    const guard = await requireUser(request);
    if (!guard.ok) return guard.response;
    // Authoritative, DB-revocation-aware catalog-upload check (a demoted user's
    // stale JWT must NOT keep the privileged upload path — a token-only check
    // wouldn't catch that). Callers without catalog:write (e.g. competition
    // entrants) fall through to the confined competition path below.
    const adminGuard = await requirePermission(request, "catalog:write");
    const isAdmin = adminGuard.ok;

    if (!s3Configured() || !s3Client) {
      return NextResponse.json(
        { error: "AWS credentials not configured" },
        { status: 500 }
      );
    }

    // Rate-limit presign issuance per user for EVERY caller (admin included) to
    // curb storage/cost abuse from a compromised session. Shared (DB-backed)
    // so the limit holds across serverless instances and deploys.
    const rl = await rateLimitShared(`presign:${guard.token.sub}`, isAdmin ? 60 : 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const { audioFileName, audioFileType, imageFileName, imageFileType } = body;
    const declaredSize = Number(body.size);

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
    // The presign is bound to this exact Content-Length so the PUT can't exceed
    // it — for EVERY caller now, not just competition entrants: an unbound
    // signature let anyone with a session upload arbitrarily large objects by
    // skipping the client-side check.
    let audioContentLength: number;

    // Untrusted (non-admin) users may only upload audio, and the SERVER owns the
    // key: we discard the client's path and force `benert-remix/<userId>/<name>`.
    // This stops an entrant from overwriting another's submission or writing
    // outside the competition prefix (the client just uses the returned fileURL).
    if (!isAdmin) {
      // Size-cap at SIGN time: reject an oversized (or missing) declared size, and
      // bind the presign to it so a huge PUT is refused by S3 even if never
      // registered via upload-complete (#6).
      if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_COMPETITION_AUDIO_BYTES) {
        return NextResponse.json({ error: "File is missing a valid size or is too large" }, { status: 400 });
      }
      audioContentLength = declaredSize;
      const base = sanitizeKey(sanitizedAudio.split("/").pop() || "");
      const ownPrefix = benertUserKeyPrefix(guard.token.sub);
      if (!base || !ownPrefix) {
        return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
      }
      audioKey = `${ownPrefix}${base}`;
    } else {
      if (!keyHasPrefix(audioKey, CATALOG_AUDIO_PREFIXES)) {
        // Admin audio keys are client-supplied — confine them to the tracks/ namespace
        // so a catalog session can't sign a PUT to an arbitrary key (#26). Non-admin
        // keys are already server-forced to the competition prefix above.
        return NextResponse.json({ error: "audioFileName must be under an allowed path" }, { status: 400 });
      }
      // Catalog uploads get the same sign-time size binding as the competition
      // path, with a cap sized for lossless masters/stems.
      const size = parseUploadSize(declaredSize, MAX_CATALOG_AUDIO_BYTES);
      if (size === null) {
        return NextResponse.json(
          { error: "size (bytes, up to 1 GB) is required" },
          { status: 400 }
        );
      }
      audioContentLength = size;
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
        ContentLength: audioContentLength,
      }),
      { expiresIn: PRESIGN_EXPIRY_S }
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
      if (!keyHasPrefix(imageKey, CATALOG_IMAGE_PREFIXES)) {
        return NextResponse.json({ error: "imageFileName must be under an allowed path" }, { status: 400 });
      }
      const imageSize = parseUploadSize(body.imageSize, MAX_IMAGE_UPLOAD_BYTES);
      if (imageSize === null) {
        return NextResponse.json(
          { error: "imageSize (bytes, up to 25 MB) is required" },
          { status: 400 }
        );
      }
      const imageUploadURL = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: imageKey,
          ContentType: imageFileType,
          ContentLength: imageSize,
        }),
        { expiresIn: PRESIGN_EXPIRY_S }
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
