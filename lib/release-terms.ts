// Licensing / deal terms for a release (Release.terms) — a single record, not a
// list. Given the label's non-exclusive model, tracks what each release is
// licensed under. Pure — safe on server or client (the panel imports the types).

export const AGREEMENT_TYPES = ["exclusive", "non_exclusive"] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  exclusive: "Exclusive",
  non_exclusive: "Non-exclusive",
};

export interface TermsRecord {
  /** Licence type, or null if not recorded. */
  type: AgreementType | null;
  /** Territory the licence covers, e.g. "Worldwide", "UK & EU". */
  territory: string | null;
  /** Rights granted, e.g. "Distribution + sync". Freeform. */
  rights: string | null;
  /** ISO date the term starts. */
  startDate: string | null;
  /** ISO date the term ends — powers the "agreement expiring" alert. */
  endDate: string | null;
  notes: string | null;
  /** The actual signed agreement/contract files attached to the release. */
  documents: AgreementDocument[];
}

export const EMPTY_TERMS: TermsRecord = {
  type: null,
  territory: null,
  rights: null,
  startDate: null,
  endDate: null,
  notes: null,
  documents: [],
};

export function isAgreementType(v: unknown): v is AgreementType {
  return typeof v === "string" && (AGREEMENT_TYPES as readonly string[]).includes(v);
}

// ── Agreement documents (the actual signed contracts / PDFs) ──────────────────
// The stored fields above are a summary; the real agreement usually lives in a
// file. These attach the actual documents to the release's terms record.

export interface AgreementDocument {
  /** Display filename, e.g. "BSK licence 2026.pdf". */
  name: string;
  /** Own-bucket S3 URL of the stored file. */
  url: string;
  /** Bytes. */
  size: number;
  /** Content type, e.g. "application/pdf". */
  type: string;
  /** ISO timestamp of when it was uploaded. */
  uploadedAt: string;
}

// Contract-y file types: PDF, Word (.doc/.docx), and scans (PNG/JPG).
export const AGREEMENT_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
] as const;

/** `accept` string for the file picker (extensions + MIME; some browsers omit one). */
export const AGREEMENT_DOC_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg";

export const AGREEMENT_DOC_EXT_RE = /\.(pdf|docx?|png|jpe?g)$/i;

export const MAX_AGREEMENT_DOC_BYTES = 50 * 1024 * 1024; // 50 MB / file
export const MAX_AGREEMENT_DOCS = 20;

export function isAllowedAgreementDocType(t: unknown): boolean {
  if (typeof t !== "string") return false;
  const type = (t.split(";")[0] ?? "").trim().toLowerCase();
  return (AGREEMENT_DOC_TYPES as readonly string[]).includes(type);
}

/** Some browsers report an empty/odd MIME for .doc/.docx — fall back to the
 *  extension so presign, PUT Content-Type and the stored type all agree. */
export function inferAgreementDocType(fileName: string, fileType: string): string {
  if (isAllowedAgreementDocType(fileType)) return fileType;
  const ext = (fileName.toLowerCase().match(AGREEMENT_DOC_EXT_RE)?.[1] ?? "").toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    default: return fileType || "application/octet-stream";
  }
}

function normalizeDocuments(raw: unknown): AgreementDocument[] {
  if (!Array.isArray(raw)) return [];
  const out: AgreementDocument[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    const name = str(o.name, 300);
    if (!url || !name) continue;
    out.push({
      name,
      url: url.slice(0, 2000),
      size: typeof o.size === "number" && Number.isFinite(o.size) && o.size >= 0 ? Math.floor(o.size) : 0,
      type: str(o.type, 200) ?? "application/octet-stream",
      uploadedAt: typeof o.uploadedAt === "string" ? o.uploadedAt.slice(0, 40) : "",
    });
    if (out.length >= MAX_AGREEMENT_DOCS) break;
  }
  return out;
}

const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const iso = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** Coerce arbitrary stored/submitted data into a clean TermsRecord. */
export function normalizeTerms(raw: unknown): TermsRecord {
  if (!raw || typeof raw !== "object") return { ...EMPTY_TERMS };
  const o = raw as Record<string, unknown>;
  return {
    type: isAgreementType(o.type) ? o.type : null,
    territory: str(o.territory, 120),
    rights: str(o.rights, 300),
    startDate: iso(o.startDate),
    endDate: iso(o.endDate),
    notes: str(o.notes, 2000),
    documents: normalizeDocuments(o.documents),
  };
}

/** True if the record carries no meaningful data (all fields empty). */
export function isTermsEmpty(t: TermsRecord): boolean {
  return (
    !t.type && !t.territory && !t.rights && !t.startDate && !t.endDate && !t.notes &&
    t.documents.length === 0
  );
}

/**
 * Days until the agreement expires (based on endDate), or null if there's no end
 * date. Negative = already expired. Used by the needs-attention "expiring" alert.
 */
export function daysUntilExpiry(t: TermsRecord, now: Date): number | null {
  if (!t.endDate) return null;
  const end = new Date(t.endDate + "T00:00:00Z").getTime();
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - now.getTime()) / 86_400_000);
}
