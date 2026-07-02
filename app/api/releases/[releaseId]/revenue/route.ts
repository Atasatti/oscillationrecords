import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import {
  normalizeSplits,
  normalizeRevenue,
  revenueTotal,
  computeOwed,
  type RevenueEntry,
} from "@/lib/release-splits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadSummary(releaseId: string) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { name: true, splits: true, revenue: true },
  });
  if (!release) return null;
  const entries = normalizeRevenue(release.revenue);
  const total = revenueTotal(entries);
  const owed = computeOwed(normalizeSplits(release.splits), total);
  return { name: release.name, entries, total, owed };
}

// GET /api/releases/[releaseId]/revenue — recorded income + who's owed (from splits).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const summary = await loadSummary(releaseId);
    if (!summary) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    const { name, ...rest } = summary;
    void name;
    return NextResponse.json(rest, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release revenue GET error:", e);
    return NextResponse.json({ error: "Failed to load revenue" }, { status: 500 });
  }
}

// POST /api/releases/[releaseId]/revenue { amount, date?, note? } — add an income entry.
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
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "A numeric amount is required" }, { status: 400 });
    }

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true, revenue: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const entry: RevenueEntry = {
      id: crypto.randomUUID(),
      amount: Math.round(amount * 100) / 100,
      date: typeof body.date === "string" && body.date ? body.date : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    };
    const next = [...normalizeRevenue(release.revenue), entry];

    await prisma.release.update({
      where: { id: releaseId },
      data: { revenue: next as unknown as Prisma.InputJsonValue },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Recorded revenue ${entry.amount} on "${release.name}"${entry.note ? ` (${entry.note})` : ""}`,
      metadata: { amount: entry.amount, note: entry.note },
    });

    const summary = await loadSummary(releaseId);
    return NextResponse.json({ entries: summary?.entries, total: summary?.total, owed: summary?.owed }, { status: 201 });
  } catch (e) {
    console.error("release revenue POST error:", e);
    return NextResponse.json({ error: "Failed to add revenue" }, { status: 500 });
  }
}

// DELETE /api/releases/[releaseId]/revenue?entryId=… — remove one income entry.
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
      select: { name: true, revenue: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const current = normalizeRevenue(release.revenue);
    const next = current.filter((e) => e.id !== entryId);

    await prisma.release.update({
      where: { id: releaseId },
      data: { revenue: next as unknown as Prisma.InputJsonValue },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Removed a revenue entry on "${release.name}"`,
    });

    const summary = await loadSummary(releaseId);
    return NextResponse.json({ entries: summary?.entries, total: summary?.total, owed: summary?.owed });
  } catch (e) {
    console.error("release revenue DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove revenue" }, { status: 500 });
  }
}
