import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — all press items in their current custom (sortOrder) order, for the admin
// "Custom order" drag view. Ties fall back to newest first.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const items = await prisma.pressItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, title: true, image: true },
    });
    return NextResponse.json({
      items: items.map((p) => ({ id: p.id, name: p.title, thumbnail: p.image })),
    });
  } catch (error) {
    console.error("Error loading press order:", error);
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

    const existing = await prisma.pressItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more press items were not found" },
        { status: 400 }
      );
    }

    // Sequential updates — a multi-document $transaction deadlocks on MongoDB.
    for (let index = 0; index < ids.length; index++) {
      await prisma.pressItem.update({ where: { id: ids[index] }, data: { sortOrder: index } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering press:", error);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }
}
