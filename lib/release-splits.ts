// Per-release revenue splits — who is owed what share of a release's income.
// Stored on Release.splits (Json). A tracking aid, not authoritative accounting.
// Pure — safe on server or client.

export interface Split {
  /** Payee name (a roster artist, collaborator, producer, the label, …). */
  payee: string;
  /** Percentage share, 0–100 (two decimals). */
  percent: number;
}

export interface SplitsSummary {
  splits: Split[];
  /** Sum of all percentages (rounded to 2dp). */
  total: number;
  /** True when the shares add up to exactly 100%. */
  balanced: boolean;
}

const clampPercent = (n: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 100) / 100)) : 0;

/** Coerce arbitrary stored/submitted data into a clean Split[] (drops blank payees). */
export function normalizeSplits(raw: unknown): Split[] {
  if (!Array.isArray(raw)) return [];
  const out: Split[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const payee = typeof o.payee === "string" ? o.payee.trim() : "";
    if (!payee) continue;
    const percent = clampPercent(typeof o.percent === "number" ? o.percent : Number(o.percent));
    out.push({ payee, percent });
  }
  return out;
}

export function summarizeSplits(splits: Split[]): SplitsSummary {
  const total = Math.round(splits.reduce((a, s) => a + s.percent, 0) * 100) / 100;
  return { splits, total, balanced: total === 100 };
}

// ---------------------------------------------------------------------------
// Revenue + owed. Recorded income (Release.revenue) combined with the split
// agreement to compute who's owed what. Amounts are plain numbers (label's own
// currency); this is a tracking aid, not accounting.
// ---------------------------------------------------------------------------

export interface RevenueEntry {
  id: string;
  amount: number;
  /** ISO date the income relates to (payout/period), or null. */
  date: string | null;
  /** Optional source/note, e.g. "DistroKid Q2" or "Bandcamp". */
  note: string | null;
}

export interface OwedRow {
  payee: string;
  percent: number;
  /** Share of total revenue = round(total * percent / 100, 2). */
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Coerce arbitrary stored/submitted data into clean RevenueEntry[]. */
export function normalizeRevenue(raw: unknown): RevenueEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RevenueEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
    if (!Number.isFinite(amount)) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : "",
      amount: round2(amount),
      date: typeof o.date === "string" && o.date ? o.date : null,
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
    });
  }
  return out;
}

export function revenueTotal(entries: RevenueEntry[]): number {
  return round2(entries.reduce((a, e) => a + e.amount, 0));
}

/** Each payee's owed share of the total revenue, per the split agreement. */
export function computeOwed(splits: Split[], total: number): OwedRow[] {
  return splits.map((s) => ({ payee: s.payee, percent: s.percent, amount: round2((total * s.percent) / 100) }));
}

// ---------------------------------------------------------------------------
// Payouts + ledger. Payments made to payees (Release.payments) are subtracted
// from each payee's owed share to give what's still outstanding.
// ---------------------------------------------------------------------------

export interface Payment {
  id: string;
  payee: string;
  amount: number;
  date: string | null;
  note: string | null;
}

export interface LedgerRow {
  payee: string;
  percent: number;
  owed: number;
  paid: number;
  outstanding: number;
}

/** Coerce arbitrary stored/submitted data into clean Payment[]. */
export function normalizePayments(raw: unknown): Payment[] {
  if (!Array.isArray(raw)) return [];
  const out: Payment[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const payee = typeof o.payee === "string" ? o.payee.trim() : "";
    const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
    if (!payee || !Number.isFinite(amount)) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : "",
      payee,
      amount: round2(amount),
      date: typeof o.date === "string" && o.date ? o.date : null,
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
    });
  }
  return out;
}

/**
 * Per-payee ledger: owed (revenue × split %), paid (matching payouts) and what's
 * still outstanding. Rows follow the split agreement; payments are matched to a
 * split payee by exact (trimmed) name.
 */
export function computeLedger(splits: Split[], total: number, payments: Payment[]): LedgerRow[] {
  const paidByPayee = new Map<string, number>();
  for (const p of payments) {
    paidByPayee.set(p.payee, round2((paidByPayee.get(p.payee) ?? 0) + p.amount));
  }
  return splits.map((s) => {
    const owed = round2((total * s.percent) / 100);
    const paid = round2(paidByPayee.get(s.payee) ?? 0);
    return { payee: s.payee, percent: s.percent, owed, paid, outstanding: round2(owed - paid) };
  });
}
