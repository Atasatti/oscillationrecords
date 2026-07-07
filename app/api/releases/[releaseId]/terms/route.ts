import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeTerms, isTermsEmpty, AGREEMENT_TYPE_LABELS } from "@/lib/release-terms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/terms — the release's licensing/deal terms.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { terms: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    return NextResponse.json({ terms: normalizeTerms(release.terms) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release terms GET error:", e);
    return NextResponse.json({ error: "Failed to load terms" }, { status: 500 });
  }
}

// PATCH /api/releases/[releaseId]/terms — replace the terms record (the form saves
// every field at once). An all-empty record clears the terms back to null.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const body = await request.json().catch(() => ({}));
    const terms = normalizeTerms(body);

    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { name: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const empty = isTermsEmpty(terms);
    await prisma.release.update({
      where: { id: releaseId },
      data: { terms: empty ? null : (terms as unknown as Prisma.InputJsonValue) },
    });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: empty
        ? `Cleared the agreement terms on "${release.name}"`
        : `Updated the agreement terms on "${release.name}"${terms.type ? ` (${AGREEMENT_TYPE_LABELS[terms.type]})` : ""}`,
      metadata: { type: terms.type, endDate: terms.endDate },
    });

    return NextResponse.json({ terms });
  } catch (e) {
    console.error("release terms PATCH error:", e);
    return NextResponse.json({ error: "Failed to save terms" }, { status: 500 });
  }
}
