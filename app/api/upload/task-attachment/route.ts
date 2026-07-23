import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requirePermission } from "@/lib/auth-guard";
import { rateLimitShared } from "@/lib/rate-limit-shared";
import { S3_BUCKET, parseUploadSize, s3Client, s3Configured, sanitizeKey, publicFileUrl } from "@/lib/s3";
import { isAllowedAttachmentType, MAX_ATTACHMENT_BYTES } from "@/lib/task-attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/upload/task-attachment { fileName, fileType } — presigned PUT URL for a
// task attachment. Outreach-gated. Only allowlisted content types (no SVG/HTML);
// the server owns the key (client can't dictate the path).
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;

  if (!s3Configured() || !s3Client) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }

  // Per-user presign rate-limit (curbs storage abuse from a compromised session).
  const rl = await rateLimitShared(`task-attach:${guard.token.sub}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json().catch(() => ({}));
    const fileType = typeof body.fileType === "string" ? body.fileType : "";
    if (!isAllowedAttachmentType(fileType)) {
      return NextResponse.json({ error: "That file type isn't allowed" }, { status: 400 });
    }
    // The server owns the key: keep only the basename of the client name, prefix
    // with a uuid folder so uploads can't collide or overwrite each other.
    const base = sanitizeKey(String(body.fileName || "").split(/[\\/]/).pop() || "");
    if (!base) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    const key = `task-attachments/${crypto.randomUUID()}/${base}`;

    // Sign-time size binding (25 MB): S3 rejects a mismatched Content-Length.
    const size = parseUploadSize(body.size, MAX_ATTACHMENT_BYTES);
    if (size === null) {
      return NextResponse.json({ error: "size (bytes, up to 25 MB) is required" }, { status: 400 });
    }

    const uploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: fileType, ContentLength: size }),
      { expiresIn: 900 }
    );

    return NextResponse.json({ uploadURL, fileURL: publicFileUrl(key) });
  } catch (e) {
    console.error("task-attachment presign error:", e);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
