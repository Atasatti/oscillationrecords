import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeSplits, summarizeSplits } from "@/lib/release-splits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/splits — the release's revenue-split agreement.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { splits: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    return NextResponse.json(summarizeSplits(normalizeSplits(release.splits)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("release splits GET error:", e);
    return NextResponse.json({ error: "Failed to load splits" }, { status: 500 });
  }
}

// PUT /api/releases/[releaseId]/splits { splits: [{payee, percent}] } — replace
// the split agreement. Catalog-gated (write) + audited.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const body = await request.json().catch(() => ({}));
    const splits = normalizeSplits(body?.splits);

    const existing = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true },
    });
    if (!existing) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    await prisma.release.update({
      where: { id: releaseId },
      data: { splits: splits as unknown as Prisma.InputJsonValue },
    });

    const summary = summarizeSplits(splits);
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Updated revenue splits on "${existing.name}" (${splits.length} payee${splits.length === 1 ? "" : "s"}, ${summary.total}%)`,
      metadata: { splits },
    });

    return NextResponse.json(summary);
  } catch (e) {
    console.error("release splits PUT error:", e);
    return NextResponse.json({ error: "Failed to save splits" }, { status: 500 });
  }
}
