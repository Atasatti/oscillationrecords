import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { S3_BUCKET, s3Client, s3Configured, sanitizeKey, publicFileUrl } from "@/lib/s3";
import { isAllowedContactAttachmentType } from "@/lib/contact-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/contact/attachment { fileName, fileType } — public presigned PUT URL
// for a Contact-form attachment. Anonymous, so it's rate-limited PER IP; only
// WAV/MP3/PNG/JPG/JPEG are allowed; the server owns the key under `contact/` (the
// client can't dictate the path). The TRUE size + type are enforced later,
// server-side, by HEAD-validation in POST /api/contact — this only gates the type.
export async function POST(request: NextRequest) {
  const rl = rateLimit(`contact-upload:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again shortly." },
      { status: 429 }
    );
  }
  if (!s3Configured() || !s3Client) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const fileType = typeof body.fileType === "string" ? body.fileType : "";
    if (!isAllowedContactAttachmentType(fileType)) {
      return NextResponse.json(
        { error: "That file type isn't supported (WAV, MP3, PNG, JPG only)." },
        { status: 400 }
      );
    }
    // Server owns the key: keep only the basename of the client name, prefixed with
    // a uuid folder so uploads can't collide or overwrite one another.
    const base = sanitizeKey(String(body.fileName || "").split(/[\\/]/).pop() || "");
    if (!base) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    const key = `contact/${crypto.randomUUID()}/${base}`;

    const uploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: fileType }),
      { expiresIn: 3600 }
    );

    return NextResponse.json({ uploadURL, fileURL: publicFileUrl(key) });
  } catch (e) {
    console.error("contact attachment presign error:", e);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
