// Shared, dependency-light validation for the public Contact form. Safe to import
// on both the client (field caps, the file <input accept> string, quick type
// checks) and the server (authoritative re-validation). Mirrors lib/contact-ticket.ts
// as the contact domain's pure, isomorphic module — NO server-only imports here.

export const CONTACT_NAME_MAX = 200;
export const CONTACT_EMAIL_MAX = 320;
export const CONTACT_MESSAGE_MAX = 5000;

// Attachment limits. Public upload, so these are also an abuse ceiling; the server
// re-checks the true size via S3 HEAD (client size checks are only for fast UX).
export const MAX_CONTACT_ATTACHMENT_BYTES = 100 * 1024 * 1024; // 100 MB / file
export const MAX_CONTACT_ATTACHMENTS = 5;

// Allowed attachment content types: lossless/lossy audio + raster images only.
// Deliberately NO SVG / HTML (those can carry script). JPG === image/jpeg.
export const ALLOWED_CONTACT_ATTACHMENT_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mpeg",
  "audio/mp3",
  "image/png",
  "image/jpeg",
] as const;

/** `accept` value for the file picker — extensions (some browsers omit MIME for
 *  WAV) plus the MIME allowlist. */
export const CONTACT_ATTACHMENT_ACCEPT =
  ".wav,.mp3,.png,.jpg,.jpeg,audio/wav,audio/x-wav,audio/mpeg,image/png,image/jpeg";

/** Client-visible file-type fallback (some browsers report an empty MIME type). */
export const CONTACT_ATTACHMENT_EXT_RE = /\.(wav|mp3|png|jpe?g)$/i;

export function isAllowedContactAttachmentType(type: unknown): boolean {
  if (typeof type !== "string") return false;
  const t = type.split(";")[0].trim().toLowerCase();
  return (ALLOWED_CONTACT_ATTACHMENT_TYPES as readonly string[]).includes(t);
}

// Basic shape check — not full RFC validation, just enough to reject obvious junk.
export const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim a field to a string and cap its length; returns "" for non-strings. */
export function cleanContactField(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** One stored/attached file. `size` + `type` are the SERVER-verified values. */
export type ContactAttachment = {
  name: string;
  url: string;
  size: number;
  type: string;
};
