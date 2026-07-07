import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import {
  normalizeSpend,
  spendTotal,
  normalizeBudget,
  SPEND_CATEGORIES,
  SPEND_CATEGORY_LABELS,
} from "@/lib/release-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type BudgetReleaseRow = {
  id: string;
  name: string;
  status: string;
  budget: number | null;
  spent: number;
  remaining: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/releases/budgets — per-release campaign budget vs spend across ALL
// releases that have a budget or any spend, plus totals and spend-by-category.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const releases = await prisma.release.findMany({
      select: { id: true, name: true, status: true, budget: true, spend: true },
    });

    const rows: BudgetReleaseRow[] = [];
    let totalBudget = 0, totalSpent = 0, overBudget = 0;
    const catTotals = new Map<string, number>();

    for (const r of releases) {
      const entries = normalizeSpend(r.spend);
      const spent = spendTotal(entries);
      const budget = normalizeBudget(r.budget);
      // Only surface releases with a budget or actual spend.
      if (budget === null && spent === 0) continue;

      rows.push({
        id: r.id,
        name: r.name,
        status: r.status,
        budget,
        spent,
        remaining: budget === null ? null : round2(budget - spent),
      });
      if (budget !== null) totalBudget = round2(totalBudget + budget);
      totalSpent = round2(totalSpent + spent);
      if (budget !== null && spent > budget) overBudget += 1;
      for (const e of entries) catTotals.set(e.category, round2((catTotals.get(e.category) ?? 0) + e.amount));
    }

    // Over-budget first, then most spent.
    rows.sort((a, b) => {
      const ao = a.remaining !== null && a.remaining < 0 ? 1 : 0;
      const bo = b.remaining !== null && b.remaining < 0 ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return b.spent - a.spent;
    });

    const byCategory = SPEND_CATEGORIES
      .map((c) => ({ category: c, label: SPEND_CATEGORY_LABELS[c], amount: catTotals.get(c) ?? 0 }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json(
      {
        releases: rows,
        totals: { budget: totalBudget, spent: totalSpent, remaining: round2(totalBudget - totalSpent), overBudget },
        byCategory,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("budgets rollup GET error:", e);
    return NextResponse.json({ error: "Failed to load budgets" }, { status: 500 });
  }
}
