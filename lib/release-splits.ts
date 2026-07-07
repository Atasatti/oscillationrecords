// Royalty splits — who shares in a release (or track). Stored on Release.splits
// and Track.splits (Json). This is a reference of contributors and their agreed
// percentage shares + their details; it does NOT track money, payouts or balances
// (Ditto pays artists directly under the label artist program). Pure — safe on
// server or client.

export interface Split {
  /** Linked roster artist id, when picked from artist search. Null for a manual entry. */
  artistId: string | null;
  /** Display / performing name (a roster artist, collaborator, producer, the label…). */
  name: string;
  /** Legal / real name — internal reference. */
  realName: string | null;
  /** Contact email — internal reference. */
  email: string | null;
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

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Coerce arbitrary stored/submitted data into a clean Split[] (drops entries with
 * no name). Back-compatible: splits saved under the old `{ payee, percent }` shape
 * read their name from `payee`.
 */
export function normalizeSplits(raw: unknown): Split[] {
  if (!Array.isArray(raw)) return [];
  const out: Split[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const name = str(o.name) || str(o.payee);
    if (!name) continue;
    const percent = clampPercent(typeof o.percent === "number" ? o.percent : Number(o.percent));
    out.push({
      artistId: str(o.artistId) || null,
      name,
      realName: str(o.realName) || null,
      email: str(o.email) || null,
      percent,
    });
  }
  return out;
}

export function summarizeSplits(splits: Split[]): SplitsSummary {
  const total = Math.round(splits.reduce((a, s) => a + s.percent, 0) * 100) / 100;
  return { splits, total, balanced: total === 100 };
}

// --- Editing helpers -------------------------------------------------------
// A SplitRow is a Split with `percent` kept as a string while being edited in a
// form. Shared by the release Splits panel, the per-track editor, and the split
// editor component so the on-screen model has one definition.

export type SplitRow = {
  artistId: string | null;
  name: string;
  realName: string;
  email: string;
  percent: string;
};

export function emptySplitRow(): SplitRow {
  return { artistId: null, name: "", realName: "", email: "", percent: "" };
}

/** Stored/loaded Split[] → editable rows. */
export function splitsToRows(splits: Split[]): SplitRow[] {
  return splits.map((s) => ({
    artistId: s.artistId ?? null,
    name: s.name,
    realName: s.realName ?? "",
    email: s.email ?? "",
    percent: s.percent ? String(s.percent) : "",
  }));
}

/** Editable rows → clean Split[] (re-uses normalizeSplits; drops nameless rows). */
export function rowsToSplits(rows: SplitRow[]): Split[] {
  return normalizeSplits(
    rows.map((r) => ({
      artistId: r.artistId,
      name: r.name,
      realName: r.realName,
      email: r.email,
      percent: Number(r.percent) || 0,
    }))
  );
}

export function rowsTotal(rows: SplitRow[]): number {
  return Math.round(rows.reduce((a, r) => a + (parseFloat(r.percent) || 0), 0) * 100) / 100;
}
