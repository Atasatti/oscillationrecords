import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Centralized S3 configuration + key/URL helpers so every upload route applies
 * the same bucket, region, and validation rules.
 */

export const AWS_REGION = process.env.AWS_REGION || "us-east-1";
export const S3_BUCKET =
  process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "osrecord";

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
    })
  : null;

export function s3Configured(): boolean {
  return hasCredentials && s3Client !== null;
}

export function publicFileUrl(key: string): string {
  return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Validates and normalizes a client-supplied object key. Rejects empty keys,
 * path traversal, absolute paths, and backslashes. Returns the trimmed key or
 * null if invalid.
 */
export function sanitizeKey(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (
    trimmed.includes("..") ||
    trimmed.startsWith("/") ||
    trimmed.includes("\\") ||
    trimmed.length > 512
  ) {
    return null;
  }
  return trimmed;
}

export function isAudioContentType(t: unknown): boolean {
  return typeof t === "string" && /^audio\//i.test(t);
}

export function isImageContentType(t: unknown): boolean {
  return typeof t === "string" && /^image\//i.test(t);
}

/** True only when the URL points at this project's own S3 bucket over https. */
export function isOwnBucketUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === `${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`
    );
  } catch {
    return false;
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

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
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!isImageContentType(contentType)) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) return null; // 0–15MB

    const ext = EXT_BY_TYPE[contentType] || "jpg";
    const key = `${keyPrefix}/${slugify(name)}-${Date.now()}.${ext}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return publicFileUrl(key);
  } catch {
    return null;
  }
}
