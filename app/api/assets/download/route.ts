import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authorizeAssetKey } from "@/lib/s3-access";
import { S3_BUCKET, s3Client, s3Configured, keyFromOwnBucketUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Header-safe Content-Disposition. The `download` attribute on an <a> is IGNORED
 * for cross-origin URLs, so an S3 link is opened/rendered instead of saved. This
 * shim makes S3 itself send the disposition so the browser saves the file with a
 * real name.
 *
 * Drops CR/LF (header injection) plus quotes/backslashes that would break the
 * quoted filename; `ascii` collapses any remaining non-printable/non-ASCII byte
 * to "_" for the plain filename=; filename* percent-encodes the full name (so no
 * raw control byte ever reaches the header while non-ASCII names still survive).
 */
function contentDisposition(name: string, disposition: "attachment" | "inline"): string {
  const clean = (name || "").replace(/[\r\n"\\]/g, "").trim() || "download";
  const ascii = clean.replace(/[^ -~]/g, "_"); // [ -~] = printable ASCII (0x20..0x7e)
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

// GET /api/assets/download?url=<own-bucket S3 url>&name=<filename>[&disposition=inline]
//
// Same-origin access shim for files on our bucket. Presigns a short-lived GET for
// one of OUR S3 objects with a Content-Disposition, so the browser saves the file
// with a real filename (or renders it inline) without ever seeing a durable link.
// Only ever redirects to our own bucket (keyFromOwnBucketUrl returns null
// otherwise), so it can't be turned into an open redirect or SSRF.
//
// This is also the ACCESS-CONTROL point for every private prefix (audit #1):
// contracts, DAM masters/stems, contact + task attachments and competition
// entries are not anonymously readable in the bucket, so the only way to them is
// here — behind authorizeAssetKey(), which requires the permission that owns the
// object's prefix (or entry ownership for a competition upload).
export async function GET(request: NextRequest) {
  if (!s3Configured() || !s3Client) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }

  const url = request.nextUrl.searchParams.get("url") || "";
  const name = request.nextUrl.searchParams.get("name") || "";
  const disposition =
    request.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  // Only our own bucket — never presign/redirect to a foreign host.
  const key = keyFromOwnBucketUrl(url);
  if (!key) {
    return NextResponse.json({ error: "Unsupported file location" }, { status: 400 });
  }

  // Authorize the specific object, not the route: a contact attachment needs
  // outreach:read, a contract needs catalog:read, an entry needs its owner/admin.
  const guard = await authorizeAssetKey(request, key);
  if (!guard.ok) return guard.response;

  try {
    const signed = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ResponseContentDisposition: contentDisposition(name || key.split("/").pop() || "download", disposition),
      }),
      { expiresIn: 300 }
    );
    // 302 to the short-lived presigned URL; S3 then returns the object with the
    // disposition above, so the browser downloads without ever showing the link.
    const res = NextResponse.redirect(signed, 302);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    console.error("asset download presign error:", e);
    return NextResponse.json({ error: "Failed to prepare download" }, { status: 500 });
  }
}
