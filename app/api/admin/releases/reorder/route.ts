import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — all releases in their current custom (sortOrder) order, for the admin
// "Custom order" drag view. Ties fall back to newest-first (matches the public grid).
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const releases = await prisma.release.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, coverImage: true, kind: true, status: true },
    });
    return NextResponse.json({
      items: releases.map((r) => ({
        id: r.id,
        name: r.name,
        thumbnail: r.coverImage,
        kind: r.kind,
        status: r.status,
      })),
    });
  } catch (error) {
    console.error("Error loading release order:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

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

    const existing = await prisma.release.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existing.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more releases were not found" },
        { status: 400 }
      );
    }

    // Sequential updates — a multi-document $transaction deadlocks on MongoDB.
    for (let index = 0; index < ids.length; index++) {
      await prisma.release.update({ where: { id: ids[index] }, data: { sortOrder: index } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering releases:", error);
    return NextResponse.json(
      { error: "Failed to save order" },
      { status: 500 }
    );
  }
}
