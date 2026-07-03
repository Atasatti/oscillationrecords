import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizePlacementInput } from "@/lib/placement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function releaseExists(id: string): Promise<boolean> {
  return !!(await prisma.release.findUnique({ where: { id }, select: { id: true } }));
}
async function artistExists(id: string): Promise<boolean> {
  return !!(await prisma.artist.findUnique({ where: { id }, select: { id: true } }));
}

// GET /api/outreach/placements — every win, most recent first.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const placements = await prisma.placement.findMany({
      orderBy: [{ placedOn: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ placements }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("placements GET error:", e);
    return NextResponse.json({ error: "Failed to load placements" }, { status: 500 });
  }
}

// POST /api/outreach/placements — log a win.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const input = normalizePlacementInput(body);
    if (!input) return NextResponse.json({ error: "An outlet is required" }, { status: 400 });
    // Drop links that don't resolve — display-only fields, no hard relation.
    if (input.releaseId && !(await releaseExists(input.releaseId))) input.releaseId = null;
    if (input.artistId && !(await artistExists(input.artistId))) input.artistId = null;

    const placement = await prisma.placement.create({ data: input });
    await recordAudit(request, guard.token, {
      action: "create",
      resource: "placement",
      resourceId: placement.id,
      summary: `Logged a ${placement.type} placement — ${placement.outlet}`,
    });
    return NextResponse.json({ placement }, { status: 201 });
  } catch (e) {
    console.error("placements POST error:", e);
    return NextResponse.json({ error: "Failed to log placement" }, { status: 500 });
  }
}
