import { prisma } from "@/lib/prisma";
import {
  normalizeSplits,
  normalizeRevenue,
  normalizePayments,
  revenueTotal,
  computeLedger,
  type RevenueEntry,
  type Payment,
  type LedgerRow,
} from "@/lib/release-splits";

/**
 * Server-side royalties summary for a release: recorded income, total, payouts,
 * and the per-payee ledger (owed / paid / outstanding). Shared by the revenue and
 * payments API routes so the computation lives in one place.
 */
export interface RoyaltiesSummary {
  name: string;
  entries: RevenueEntry[];
  total: number;
  payments: Payment[];
  ledger: LedgerRow[];
}

export async function loadRoyaltiesSummary(releaseId: string): Promise<RoyaltiesSummary | null> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { name: true, splits: true, revenue: true, payments: true },
  });
  if (!release) return null;

  const entries = normalizeRevenue(release.revenue);
  const total = revenueTotal(entries);
  const payments = normalizePayments(release.payments);
  const ledger = computeLedger(normalizeSplits(release.splits), total, payments);
  return { name: release.name, entries, total, payments, ledger };
}
