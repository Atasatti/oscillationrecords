import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import {
  isPlacementType,
  normalizeReach,
  objectIdOrNull,
  placementStr,
  safeUrl,
  toUtcDay,
} from "@/lib/placement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

async function releaseExists(id: string): Promise<boolean> {
  return !!(await prisma.release.findUnique({ where: { id }, select: { id: true } }));
}
async function artistExists(id: string): Promise<boolean> {
  return !!(await prisma.artist.findUnique({ where: { id }, select: { id: true } }));
}

// PATCH /api/outreach/placements/[id] — partial update. Only provided fields.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("type" in o) {
      if (!isPlacementType(o.type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
      data.type = o.type;
    }
    if ("outlet" in o) {
      const s = placementStr(o.outlet, 200);
      if (!s) return NextResponse.json({ error: "Outlet is required" }, { status: 400 });
      data.outlet = s;
    }
    if ("name" in o) data.name = placementStr(o.name, 200);
    if ("url" in o) data.url = safeUrl(o.url);
    if ("reach" in o) data.reach = normalizeReach(o.reach);
    if ("placedOn" in o) data.placedOn = o.placedOn ? toUtcDay(o.placedOn) : null;
    if ("releaseId" in o) {
      const rid = objectIdOrNull(o.releaseId);
      data.releaseId = rid && (await releaseExists(rid)) ? rid : null;
    }
    if ("artistId" in o) {
      const aid = objectIdOrNull(o.artistId);
      data.artistId = aid && (await artistExists(aid)) ? aid : null;
    }
    if ("notes" in o) data.notes = placementStr(o.notes, 2000);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const placement = await prisma.placement.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "placement",
      resourceId: id,
      summary: `Updated placement — ${placement.outlet}`,
      metadata: { type: data.type },
    });
    return NextResponse.json({ placement });
  } catch (e) {
    console.error("placement PATCH error:", e);
    return NextResponse.json({ error: "Failed to update placement" }, { status: 500 });
  }
}

// DELETE /api/outreach/placements/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.placement.findUnique({ where: { id }, select: { outlet: true } });
    if (!existing) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

    await prisma.placement.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "placement",
      resourceId: id,
      summary: `Deleted placement — ${existing.outlet}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("placement DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete placement" }, { status: 500 });
  }
}
