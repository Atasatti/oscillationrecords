/**
 * Client-safe S3 key/URL helpers — pure string/URL logic with NO AWS SDK or
 * node: imports, so client components can bundle it. Server-only code (the S3
 * client, delete/head/rehost operations) lives in ./s3, which re-exports
 * everything here.
 *
 * NOTE for client bundles: process.env.AWS_* is undefined in the browser, so
 * these constants resolve to their fallbacks there. The fallbacks must match
 * the deployed values (bucket "osrecord", region "us-east-1") or helpers like
 * isOwnBucketUrl would disagree between server and client.
 */

export const AWS_REGION = process.env.AWS_REGION || "us-east-1";
export const S3_BUCKET =
  process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "osrecord";

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

// Server-owned key namespaces the catalog upload routes may write to. Confining
// client-supplied presign keys to these stops a catalog editor (or a compromised
// catalog session) from signing a PUT to an ARBITRARY key — e.g. overwriting a
// competition entry (benert-remix/) or a task attachment or another scope's object.
export const CATALOG_IMAGE_PREFIXES = ["artists/", "press/", "releases/", "site/"] as const;
export const CATALOG_AUDIO_PREFIXES = ["tracks/"] as const;

/** True when `key` sits under one of the allowed prefixes. */
export function keyHasPrefix(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => key.startsWith(p));
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

/**
 * Reverse of {@link publicFileUrl}: the object key for one of OUR bucket URLs, or
 * null for anything else (external host, malformed). The path is percent-decoded
 * so the key round-trips (publicFileUrl encodes nothing, but S3 URLs in the wild
 * may carry encoded spaces/unicode). Callers use this to presign a download for a
 * file we host — the null result is what keeps the download route from ever
 * redirecting to a foreign origin.
 */
export function keyFromOwnBucketUrl(url: unknown): string | null {
  if (!isOwnBucketUrl(url)) return null;
  try {
    const path = new URL(url as string).pathname.replace(/^\/+/, "");
    const key = decodeURIComponent(path);
    return key.trim() ? key : null;
  } catch {
    return null;
  }
}
