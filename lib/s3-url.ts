// Pure S3 URL / key / content-type helpers. This module has NO AWS SDK and NO
// node:* imports, so it's safe to import from client components. The server-only
// S3 client, presigning, delete/head, and SSRF checks (which pull in
// @aws-sdk/client-s3, node:dns and node:net) live in lib/s3.ts, which re-exports
// everything here for existing server callers.
//
// Note: on the client, non-NEXT_PUBLIC env is stripped, so S3_BUCKET/AWS_REGION
// fall back to the defaults below — which match the deployed bucket, so the URL
// checks below still resolve correctly in the browser.

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

// ---------------------------------------------------------------------------
// Public vs PRIVATE object classification (audit #1).
//
// The bucket serves public site media (cover art, artist/press images, released
// audio) anonymously, but everything below is sensitive — legal contracts, DAM
// masters/stems/EPKs, contact-form attachments, internal task attachments and
// competition entries. Those prefixes are NOT anonymously readable (see the
// bucket policy in docs/superpowers/specs/2026-07-16-s3-private-assets-design.md);
// they're only reachable through GET /api/assets/download, which authorizes the
// caller per prefix and then 302s to a 5-minute presigned GET.
//
// Anything emitting a link to a stored file must go through assetViewHref() /
// assetDownloadHref() below rather than publicFileUrl(), so a private object's
// raw bucket URL never reaches a page, an API response or a log.
// ---------------------------------------------------------------------------
export const PRIVATE_KEY_PREFIXES = [
  "assets/", // DAM uploads: masters, stems, EPKs, documents
  "benert-remix/", // competition entries (entrant's own audio)
  "contact/", // contact-form attachments (public submitters' files)
  "documents/",
  "quarantine/", // orphan-sweep holding area (scripts/cleanup-orphaned-audio.mjs)
  "releases/agreements/", // signed contracts / licence scans
  "task-attachments/", // internal task files
  "tracks/stems/",
] as const;

/** True when `key` must never be anonymously readable. */
export function isPrivateAssetKey(key: string): boolean {
  return PRIVATE_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/** True for one of OUR bucket URLs that points at a private object. */
export function isPrivateAssetUrl(url: unknown): boolean {
  const key = keyFromOwnBucketUrl(url);
  return key !== null && isPrivateAssetKey(key);
}

/** The competition-entry key prefix owned by one user (`sub` = JWT subject).
 *  Presign, upload-complete and the download shim all derive ownership from it,
 *  so it lives here as the single definition. */
export function benertUserKeyPrefix(sub: unknown): string | null {
  const safeSub = String(sub || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
  return safeSub ? `benert-remix/${safeSub}/` : null;
}

/** Same-origin shim href that authorizes the caller and then presigns a GET. */
export function assetDownloadHref(
  url: string,
  name?: string | null,
  disposition: "attachment" | "inline" = "attachment"
): string {
  const q = new URLSearchParams({ url });
  if (name) q.set("name", name);
  if (disposition === "inline") q.set("disposition", "inline");
  return `/api/assets/download?${q.toString()}`;
}

/**
 * The href to OPEN or render a stored file: the direct bucket URL for public
 * media (CDN-cacheable, `next/image`-optimizable), and the authorization-gated
 * shim for a private object. Use this everywhere a stored URL is rendered.
 */
export function assetViewHref(url: string, name?: string | null): string {
  return isPrivateAssetUrl(url) ? assetDownloadHref(url, name, "inline") : url;
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
