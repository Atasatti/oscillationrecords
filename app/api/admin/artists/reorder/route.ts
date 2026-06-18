import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — all artists in current custom (sortOrder) order, for the admin
// "Custom order" drag view. Ties fall back to name (matches the public list).
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const artists = await prisma.artist.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, profilePicture: true },
    });
    return NextResponse.json({ items: artists });
  } catch (error) {
    console.error("Error loading artist order:", error);
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

    const existing = await prisma.artist.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existing.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more artists were not found" },
        { status: 400 }
      );
    }

    // Sequential updates — a multi-document $transaction deadlocks on MongoDB.
    for (let index = 0; index < ids.length; index++) {
      await prisma.artist.update({ where: { id: ids[index] }, data: { sortOrder: index } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering artists:", error);
    return NextResponse.json(
      { error: "Failed to save artist order" },
      { status: 500 }
    );
  }
}

