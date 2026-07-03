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
}

export const EMPTY_TERMS: TermsRecord = {
  type: null,
  territory: null,
  rights: null,
  startDate: null,
  endDate: null,
  notes: null,
};

export function isAgreementType(v: unknown): v is AgreementType {
  return typeof v === "string" && (AGREEMENT_TYPES as readonly string[]).includes(v);
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
  };
}

/** True if the record carries no meaningful data (all fields empty). */
export function isTermsEmpty(t: TermsRecord): boolean {
  return !t.type && !t.territory && !t.rights && !t.startDate && !t.endDate && !t.notes;
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
