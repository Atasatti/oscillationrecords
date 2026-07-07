// Campaign budget & spend for a release (Release.budget + Release.spend) — the
// marketing-spend tracker (distinct from royalty splits, which are just artist
// shares). A tracking aid, not accounting. Server-only (loadBudgetSummary touches
// prisma); the panel declares its own inline types.

import { prisma } from "@/lib/prisma";

export const SPEND_CATEGORIES = ["playlist", "ads", "pr", "radio", "video", "other"] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const SPEND_CATEGORY_LABELS: Record<SpendCategory, string> = {
  playlist: "Playlist / curators",
  ads: "Ads",
  pr: "PR / press",
  radio: "Radio",
  video: "Video / content",
  other: "Other",
};

export interface SpendEntry {
  id: string;
  amount: number;
  category: SpendCategory;
  /** ISO date the spend relates to, or null. */
  date: string | null;
  /** Optional note, e.g. "Groover campaign", "Meta ads". */
  note: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isSpendCategory(v: unknown): v is SpendCategory {
  return typeof v === "string" && (SPEND_CATEGORIES as readonly string[]).includes(v);
}

/** Coerce arbitrary stored/submitted data into clean SpendEntry[]. */
export function normalizeSpend(raw: unknown): SpendEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SpendEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
    // Spend is never negative (matches the POST contract) — drop bad entries so
    // totals, the budget bar, and the by-category rollup stay coherent.
    if (!Number.isFinite(amount) || amount < 0) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : "",
      amount: round2(amount),
      category: isSpendCategory(o.category) ? o.category : "other",
      date: typeof o.date === "string" && o.date ? o.date : null,
      note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
    });
  }
  return out;
}

export function spendTotal(entries: SpendEntry[]): number {
  return round2(entries.reduce((a, e) => a + e.amount, 0));
}

/** A budget target — a non-negative number, or null if unset/invalid. */
export function normalizeBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

export type BudgetSummary = {
  budget: number | null;
  entries: SpendEntry[];
  total: number;
  /** budget - total when a budget is set, else null. Negative = over budget. */
  remaining: number | null;
};

export async function loadBudgetSummary(releaseId: string): Promise<BudgetSummary | null> {
  const r = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { budget: true, spend: true },
  });
  if (!r) return null;
  const entries = normalizeSpend(r.spend);
  const total = spendTotal(entries);
  const budget = normalizeBudget(r.budget);
  return { budget, entries, total, remaining: budget === null ? null : round2(budget - total) };
}
