import { S3Client } from "@aws-sdk/client-s3";

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
