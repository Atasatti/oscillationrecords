import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { rateLimitShared } from "@/lib/rate-limit-shared";
import { S3_BUCKET, parseUploadSize, s3Client, s3Configured, sanitizeKey, publicFileUrl } from "@/lib/s3";
import { isAllowedAgreementDocType, MAX_AGREEMENT_DOC_BYTES } from "@/lib/release-terms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/releases/[releaseId]/agreement/presign { fileName, fileType } —
// presigned PUT URL for an agreement/contract document (PDF / DOC / DOCX / PNG /
// JPG). Catalog-write gated. The server owns the key under
// releases/agreements/<releaseId>/ so the client can't dictate the path.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;

  if (!s3Configured() || !s3Client) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }

  const rl = await rateLimitShared(`agreement-upload:${guard.token.sub}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { releaseId } = await params;
  const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { id: true } });
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const fileType = typeof body.fileType === "string" ? body.fileType : "";
    if (!isAllowedAgreementDocType(fileType)) {
      return NextResponse.json(
        { error: "That file type isn't supported (PDF, DOC, DOCX, PNG, JPG)." },
        { status: 400 }
      );
    }
    const base = sanitizeKey(String(body.fileName || "").split(/[\\/]/).pop() || "");
    if (!base) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    const key = `releases/agreements/${releaseId}/${crypto.randomUUID()}/${base}`;

    // Sign-time size binding (50 MB): S3 rejects a mismatched Content-Length.
    const size = parseUploadSize(body.size, MAX_AGREEMENT_DOC_BYTES);
    if (size === null) {
      return NextResponse.json({ error: "size (bytes, up to 50 MB) is required" }, { status: 400 });
    }

    const uploadURL = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: fileType, ContentLength: size }),
      { expiresIn: 900 }
    );

    return NextResponse.json({ uploadURL, fileURL: publicFileUrl(key) });
  } catch (e) {
    console.error("agreement presign error:", e);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
