import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import {
  loadBudgetSummary,
  normalizeSpend,
  normalizeBudget,
  isSpendCategory,
  type SpendEntry,
} from "@/lib/release-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/spend — budget target + spend entries + totals.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const res = await loadBudgetSummary(releaseId);
    if (!res) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    return NextResponse.json(res, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release spend GET error:", e);
    return NextResponse.json({ error: "Failed to load budget" }, { status: 500 });
  }
}

// POST /api/releases/[releaseId]/spend { amount, category?, date?, note? } — add spend.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const body = await request.json().catch(() => ({}));
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "A non-negative amount is required" }, { status: 400 });
    }

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true, spend: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const entry: SpendEntry = {
      id: crypto.randomUUID(),
      amount: Math.round(amount * 100) / 100,
      category: isSpendCategory(body.category) ? body.category : "other",
      date: typeof body.date === "string" && body.date ? body.date : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    };
    const next = [...normalizeSpend(release.spend), entry];

    await prisma.release.update({
      where: { id: releaseId },
      data: { spend: next as unknown as Prisma.InputJsonValue },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Recorded ${entry.amount} spend (${entry.category}) on "${release.name}"${entry.note ? ` — ${entry.note}` : ""}`,
      metadata: { amount: entry.amount, category: entry.category, note: entry.note },
    });

    return NextResponse.json(await loadBudgetSummary(releaseId), { status: 201 });
  } catch (e) {
    console.error("release spend POST error:", e);
    return NextResponse.json({ error: "Failed to add spend" }, { status: 500 });
  }
}

// PATCH /api/releases/[releaseId]/spend { budget } — set or clear the budget target.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const body = await request.json().catch(() => ({}));
    const budget = normalizeBudget(body.budget); // null clears it

    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { name: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    await prisma.release.update({ where: { id: releaseId }, data: { budget } });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: budget === null ? `Cleared the budget on "${release.name}"` : `Set the budget to ${budget} on "${release.name}"`,
      metadata: { budget },
    });

    return NextResponse.json(await loadBudgetSummary(releaseId));
  } catch (e) {
    console.error("release spend PATCH error:", e);
    return NextResponse.json({ error: "Failed to set budget" }, { status: 500 });
  }
}

// DELETE /api/releases/[releaseId]/spend?entryId=… — remove one spend entry.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const entryId = new URL(request.url).searchParams.get("entryId") || "";
    if (!entryId) return NextResponse.json({ error: "entryId is required" }, { status: 400 });

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true, spend: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const next = normalizeSpend(release.spend).filter((e) => e.id !== entryId);
    await prisma.release.update({
      where: { id: releaseId },
      data: { spend: next as unknown as Prisma.InputJsonValue },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Removed a spend entry on "${release.name}"`,
    });

    return NextResponse.json(await loadBudgetSummary(releaseId));
  } catch (e) {
    console.error("release spend DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove spend" }, { status: 500 });
  }
}
