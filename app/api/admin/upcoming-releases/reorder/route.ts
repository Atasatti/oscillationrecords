import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const orderedIds = body.orderedIds;
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

    const now = new Date();
    const existing = await prisma.upcomingRelease.findMany({
      where: {
        id: { in: ids },
        releaseDate: { gt: now },
      },
      select: { id: true },
    });

    if (existing.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more items are missing or no longer scheduled" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.upcomingRelease.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering upcoming releases:", error);
    return NextResponse.json(
      { error: "Failed to save order" },
      { status: 500 }
    );
  }
}
