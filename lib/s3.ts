import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { lookup } from "node:dns/promises";
import net from "node:net";
import {
  AWS_REGION,
  S3_BUCKET,
  isImageContentType,
  isOwnBucketUrl,
  publicFileUrl,
} from "./s3-shared";

/**
 * Centralized S3 configuration + server-side operations so every upload route
 * applies the same bucket, region, and validation rules. Pure key/URL helpers
 * live in ./s3-shared (client-safe) and are re-exported here so server code
 * can keep importing everything from one place.
 */

export * from "./s3-shared";

const hasCredentials = Boolean(
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
);

export const s3Client = hasCredentials
  ? new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      // AWS SDK v3 adds a default CRC32 integrity checksum to requests. For a
      // PRESIGNED PUT that checksum is computed at sign time over an EMPTY body and
      // baked into the URL (x-amz-checksum-crc32 / x-amz-sdk-checksum-algorithm);
      // when the browser then PUTs the real file, S3 can reject the checksum
      // mismatch and the upload dies as "Failed to fetch". Those params don't belong
      // in a presigned browser-upload URL — "WHEN_REQUIRED" restores the old
      // behavior (checksum only when an operation truly needs it), which is AWS's
      // recommended setting for presigned uploads (contact attachments, assets,
      // task attachments all presign browser PUTs).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  : null;

export function s3Configured(): boolean {
  return hasCredentials && s3Client !== null;
}

/** Delete an object from our bucket. Best-effort: returns false (never throws)
 *  when S3 isn't configured or the delete fails, so callers can proceed. */
export async function deleteS3Object(key: string): Promise<boolean> {
  if (!s3Configured() || !s3Client) return false;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch (e) {
    console.error(`Failed to delete S3 object ${key}:`, e);
    return false;
  }
}

/** HEAD an object to confirm it exists and read its true size + content-type
 *  (used to validate an uploaded asset rather than trusting client-claimed
 *  metadata). Returns null if S3 isn't configured or the object is missing. */
export async function headS3Object(
  key: string
): Promise<{ size: number; contentType: string } | null> {
  if (!s3Configured() || !s3Client) return null;
  try {
    const r = await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return {
      size: typeof r.ContentLength === "number" ? r.ContentLength : 0,
      contentType: r.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// ---------------------------------------------------------------------------
// SSRF protection for outbound image fetches (rehostExternalImage).
//
// rehostExternalImage fetches a caller-supplied URL server-side, so without a
// guard it can be pointed at internal hosts or the cloud metadata endpoint
// (169.254.169.254) and follow redirects into private space. We resolve the
// target's DNS and reject any address in a loopback/private/link-local/reserved
// range, reject non-default ports, and follow redirects MANUALLY so each hop is
// re-validated (a redirect can't smuggle us to an internal address).
//
// Residual risk: a DNS-rebinding race between our lookup and fetch's own
// resolution (TOCTOU) is not fully closed here (undici doesn't expose per-request
// IP pinning cleanly); acceptable given these callers are all admin-gated.
// ---------------------------------------------------------------------------

/** True when an IP literal falls in a range we must never fetch from (SSRF).
 *  Exported for unit tests; not part of the public helper surface. */
export function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true;
    const [a = 0, b = 0] = p;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.*
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    // IPv4-mapped / -compatible (::ffff:a.b.c.d) — re-check the embedded v4.
    const mapped = lower.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1] ?? "");
    if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
        lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10 link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique-local
    return false;
  }
  return true; // not a parseable IP → refuse
}

/**
 * SSRF-safe image fetch: validates scheme/port, resolves DNS and blocks
 * private/loopback/link-local/metadata targets, and follows up to `maxHops`
 * redirects while re-validating every hop. Returns the final Response, or null
 * if the target is disallowed / unreachable / redirects too many times.
 */
async function safeImageFetch(rawUrl: string, maxHops = 3): Promise<Response | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.port && u.port !== "80" && u.port !== "443") return null;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    if (net.isIP(host)) {
      addresses = [host];
    } else {
      try {
        addresses = (await lookup(host, { all: true })).map((r) => r.address);
      } catch {
        return null;
      }
    }
    if (!addresses.length || addresses.some(isBlockedAddress)) return null;

    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).toString();
      continue; // re-validate the redirect target on the next iteration
    }
    return res;
  }
  return null; // exceeded redirect budget
}

/** Filename-safe slug from an artist/release name (for human-readable S3 keys). */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

/**
 * Copy a remote image (e.g. a Spotify `i.scdn.co` URL pulled in during artist
 * import) into our own S3 bucket so the image file is hosted by us — which is
 * what lets it rank/attribute to our pages in Google Images, and what we can
 * list in the image sitemap. Returns the new public S3 URL.
 *
 * Best-effort and idempotent: returns the URL unchanged when it's already on our
 * bucket, and returns null (caller keeps the original) when S3 isn't configured,
 * the fetch fails, or the content isn't a sane-sized image. Never throws.
 */
export async function rehostExternalImage(
  url: string,
  name: string,
  keyPrefix = "artists/images"
): Promise<string | null> {
  if (isOwnBucketUrl(url)) return url; // already ours — no-op
  if (!s3Configured() || !s3Client) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  try {
    // SSRF-safe: DNS/IP-validated, port-restricted, manual redirect re-validation.
    const res = await safeImageFetch(url);
    if (!res || !res.ok) return null;
    const contentType = ((res.headers.get("content-type") || "").split(";")[0] ?? "").trim().toLowerCase();
    // Only raster types we can re-key. Explicitly excludes image/svg+xml: an SVG
    // served from our public bucket can execute script when navigated directly.
    const ext = EXT_BY_TYPE[contentType];
    if (!ext || !isImageContentType(contentType)) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) return null; // 0–15MB

    const key = `${keyPrefix}/${slugify(name)}-${Date.now()}.${ext}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: bytes,
        // Derive the stored type from our own validated map, never the remote
        // header, so a hostile origin can't dictate an active content-type.
        ContentType: contentType,
        ContentDisposition: "inline",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return publicFileUrl(key);
  } catch {
    return null;
  }
}
