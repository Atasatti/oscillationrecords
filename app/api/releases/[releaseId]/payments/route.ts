import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizePayments, type Payment } from "@/lib/release-splits";
import { loadRoyaltiesSummary } from "@/lib/release-royalties";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function summaryResponse(releaseId: string) {
  const s = await loadRoyaltiesSummary(releaseId);
  if (!s) return null;
  return { entries: s.entries, total: s.total, payments: s.payments, ledger: s.ledger };
}

// POST /api/releases/[releaseId]/payments { payee, amount, date?, note? } — record
// a payout to a payee. Catalog-gated (write) + audited.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const body = await request.json().catch(() => ({}));
    const payee = typeof body.payee === "string" ? body.payee.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    if (!payee) return NextResponse.json({ error: "A payee is required" }, { status: 400 });
    if (!Number.isFinite(amount)) return NextResponse.json({ error: "A numeric amount is required" }, { status: 400 });

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true, payments: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const payment: Payment = {
      id: crypto.randomUUID(),
      payee,
      amount: Math.round(amount * 100) / 100,
      date: typeof body.date === "string" && body.date ? body.date : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    };
    const next = [...normalizePayments(release.payments), payment];

    await prisma.release.update({
      where: { id: releaseId },
      data: { payments: next as unknown as Prisma.InputJsonValue },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Recorded a ${payment.amount} payout to ${payee} on "${release.name}"`,
      metadata: { payee, amount: payment.amount },
    });

    return NextResponse.json(await summaryResponse(releaseId), { status: 201 });
  } catch (e) {
    console.error("release payments POST error:", e);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}

// DELETE /api/releases/[releaseId]/payments?paymentId=… — remove one payout.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const paymentId = new URL(request.url).searchParams.get("paymentId") || "";
    if (!paymentId) return NextResponse.json({ error: "paymentId is required" }, { status: 400 });

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true, payments: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const next = normalizePayments(release.payments).filter((p) => p.id !== paymentId);
    await prisma.release.update({
      where: { id: releaseId },
      data: { payments: next as unknown as Prisma.InputJsonValue },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Removed a payout on "${release.name}"`,
    });

    return NextResponse.json(await summaryResponse(releaseId));
  } catch (e) {
    console.error("release payments DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove payment" }, { status: 500 });
  }
}
