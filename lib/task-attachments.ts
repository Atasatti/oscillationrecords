// File attachments on an OutreachTask (Task.attachments Json). Files live on our
// own S3 bucket. Pure — safe on server or client.

export interface Attachment {
  id: string;
  name: string;
  url: string;
  /** Bytes, if known. */
  size: number | null;
  /** MIME type. */
  type: string;
}

// Allowlist of attachment content types. Deliberately EXCLUDES image/svg+xml and
// text/html — an SVG/HTML served from the public bucket can execute script when
// navigated directly. Covers documents, spreadsheets, PDFs, raster images, csv/
// text and zips — the things you'd attach to a label task.
export const ALLOWED_ATTACHMENT_TYPES: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/zip",
];

/** `accept` attribute for the file input. */
export const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB

export function isAllowedAttachmentType(t: unknown): boolean {
  return typeof t === "string" && ALLOWED_ATTACHMENT_TYPES.includes(t);
}

/** Coerce arbitrary stored/submitted data into clean Attachment[]. */
export function normalizeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 300) : "";
    const url = typeof o.url === "string" ? o.url : "";
    if (!name || !url) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : "",
      name,
      url,
      size: typeof o.size === "number" && Number.isFinite(o.size) ? o.size : null,
      type: typeof o.type === "string" ? o.type : "",
    });
  }
  return out;
}
