import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PUT /api/admin/tracks/reorder - set the track order within a single release (admin only)
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const releaseId = typeof body.releaseId === "string" ? body.releaseId : "";
    const orderedIds = body.orderedIds;

    if (!releaseId) {
      return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
    }
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { error: "orderedIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const ids = orderedIds.map((id: unknown) => String(id));
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      return NextResponse.json(
        { error: "orderedIds must not contain duplicates" },
        { status: 400 }
      );
    }

    // Every id must be a track that belongs to this release.
    const existing = await prisma.track.findMany({
      where: { id: { in: ids }, releaseId },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more tracks were not found on this release" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.track.update({ where: { id }, data: { sortOrder: index } })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering tracks:", error);
    return NextResponse.json(
      { error: "Failed to save track order" },
      { status: 500 }
    );
  }
}
