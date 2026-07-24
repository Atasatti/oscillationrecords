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

/**
 * The save gate, applied by EVERY route that accepts splits (release panel
 * PUT, per-track dialog PATCH, and the tracklist PATCH whenever splits are
 * present in the payload): null when acceptable, else the rejection reason.
 * Empty is fine — "no split agreement recorded" — but a non-empty split must
 * name each contributor once and allocate exactly 100.00%. The autosaving
 * tracklist editor stays usable because its client WITHHOLDS an invalid
 * mid-edit split (the field is omitted, so the stored value is kept) and
 * shows an inline "not saved until valid" note instead.
 */
export function splitsProblem(splits: Split[]): string | null {
  if (splits.length === 0) return null;
  // Duplicates first — "the same artist twice" is a clearer error than a total
  // that also happens to be off because of the duplication.
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const s of splits) {
    if (s.artistId) {
      if (seenIds.has(s.artistId)) return `"${s.name}" appears more than once in the split.`;
      seenIds.add(s.artistId);
    }
    const nameKey = s.name.toLowerCase();
    if (seenNames.has(nameKey)) return `"${s.name}" appears more than once in the split.`;
    seenNames.add(nameKey);
  }
  const { total } = summarizeSplits(splits);
  if (total !== 100) {
    return `Royalty splits must total exactly 100% — currently ${total}%.`;
  }
  return null;
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
  /**
   * Client-only, captured at load/add (not persisted): the LINKED artist's profile
   * already holds this field. When true the editor shows it read-only (personal
   * details live on the profile, not the split); when a linked artist is missing it,
   * the field is editable and the entered value is written back to the profile on
   * save. Always false/absent for manual (unlinked) rows.
   */
  profileHasRealName?: boolean;
  profileHasEmail?: boolean;
};

export function emptySplitRow(): SplitRow {
  return { artistId: null, name: "", realName: "", email: "", percent: "" };
}

/**
 * Stored/loaded Split[] → editable rows. For a linked artist the caller is expected
 * to have resolved realName/email from the profile (the splits GET does), so a
 * non-empty value here means the profile has it → mark it read-only in the editor.
 */
export function splitsToRows(splits: Split[]): SplitRow[] {
  return splits.map((s) => ({
    artistId: s.artistId ?? null,
    name: s.name,
    realName: s.realName ?? "",
    email: s.email ?? "",
    percent: s.percent ? String(s.percent) : "",
    profileHasRealName: !!(s.artistId && s.realName && s.realName.trim()),
    profileHasEmail: !!(s.artistId && s.email && s.email.trim()),
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
