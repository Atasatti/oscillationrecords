import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/object-id";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { resolveUserId } from "@/lib/current-user";
import {
  DELIVERY_STAGE_LABELS,
  deliveryStr,
  isDeliveryStage,
  type DeliveryRecord,
  type DeliveryStage,
} from "@/lib/release-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function buildRecord(row: {
  deliveryStatus: string;
  deliveryNotes: string | null;
  deliveryUpdatedAt: Date | null;
  deliveryUpdatedById: string | null;
}): Promise<DeliveryRecord> {
  let updatedBy: string | null = null;
  if (row.deliveryUpdatedById) {
    const u = await prisma.user
      .findUnique({ where: { id: row.deliveryUpdatedById }, select: { name: true, email: true } })
      .catch(() => null);
    updatedBy = u?.name || u?.email || null;
  }
  return {
    status: (isDeliveryStage(row.deliveryStatus) ? row.deliveryStatus : "not_started") as DeliveryStage,
    notes: row.deliveryNotes,
    updatedAt: row.deliveryUpdatedAt ? row.deliveryUpdatedAt.toISOString() : null,
    updatedBy,
  };
}

const SELECT = {
  deliveryStatus: true,
  deliveryNotes: true,
  deliveryUpdatedAt: true,
  deliveryUpdatedById: true,
} as const;

// GET /api/releases/[releaseId]/delivery — the release's delivery/sign-off state.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: SELECT });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    return NextResponse.json({ delivery: await buildRecord(release) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release delivery GET error:", e);
    return NextResponse.json({ error: "Failed to load delivery status" }, { status: 500 });
  }
}

// PATCH /api/releases/[releaseId]/delivery { status?, notes? } — advance the
// delivery stage and/or edit the notes. Stamps who/when on any change.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if ("status" in o) {
      if (!isDeliveryStage(o.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      data.deliveryStatus = o.status;
    }
    if ("notes" in o) data.deliveryNotes = deliveryStr(o.notes, 2000);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    data.deliveryUpdatedAt = new Date();
    data.deliveryUpdatedById = await resolveUserId(guard.token);

    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { name: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const updated = await prisma.release.update({ where: { id: releaseId }, data, select: SELECT });
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: data.deliveryStatus
        ? `Set delivery on "${release.name}" → ${DELIVERY_STAGE_LABELS[data.deliveryStatus as DeliveryStage]}`
        : `Updated delivery notes on "${release.name}"`,
      metadata: { status: data.deliveryStatus },
    });
    return NextResponse.json({ delivery: await buildRecord(updated) });
  } catch (e) {
    console.error("release delivery PATCH error:", e);
    return NextResponse.json({ error: "Failed to update delivery status" }, { status: 500 });
  }
}
