import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import {
  normalizeSplits,
  normalizeRevenue,
  normalizePayments,
  revenueTotal,
  computeLedger,
} from "@/lib/release-splits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type PayeeReleaseRow = { id: string; name: string; owed: number; paid: number; outstanding: number };
export type PayeeRollup = {
  payee: string;
  owed: number;
  paid: number;
  outstanding: number;
  releases: PayeeReleaseRow[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/releases/royalties — per-payee owed/paid/outstanding aggregated across
// ALL releases (each release's ledger summed by payee). Catalog-gated.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const releases = await prisma.release.findMany({
      select: { id: true, name: true, splits: true, revenue: true, payments: true },
    });

    const byPayee = new Map<string, PayeeRollup>();
    let tOwed = 0, tPaid = 0, tOutstanding = 0;

    for (const r of releases) {
      const total = revenueTotal(normalizeRevenue(r.revenue));
      const ledger = computeLedger(normalizeSplits(r.splits), total, normalizePayments(r.payments));
      for (const row of ledger) {
        // Skip payees with no financial activity on this release.
        if (row.owed === 0 && row.paid === 0) continue;
        const acc = byPayee.get(row.payee) ?? { payee: row.payee, owed: 0, paid: 0, outstanding: 0, releases: [] };
        acc.owed = round2(acc.owed + row.owed);
        acc.paid = round2(acc.paid + row.paid);
        acc.outstanding = round2(acc.outstanding + row.outstanding);
        acc.releases.push({ id: r.id, name: r.name, owed: row.owed, paid: row.paid, outstanding: row.outstanding });
        byPayee.set(row.payee, acc);
        tOwed = round2(tOwed + row.owed);
        tPaid = round2(tPaid + row.paid);
        tOutstanding = round2(tOutstanding + row.outstanding);
      }
    }

    // Most-owed first; each payee's releases most-outstanding first.
    const payees = [...byPayee.values()]
      .map((p) => ({ ...p, releases: p.releases.sort((a, b) => b.outstanding - a.outstanding) }))
      .sort((a, b) => b.outstanding - a.outstanding || b.owed - a.owed);

    return NextResponse.json(
      { payees, totals: { owed: tOwed, paid: tPaid, outstanding: tOutstanding } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("royalties rollup GET error:", e);
    return NextResponse.json({ error: "Failed to load royalties" }, { status: 500 });
  }
}
