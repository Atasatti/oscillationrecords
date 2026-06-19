import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/benert-remix/admin/start - Start competition (admin only)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const durationHours =
      body.durationHours === undefined ? 24 : body.durationHours;

    // Whole hours, 1..8760 (a year). Rejects floats (Int column), Infinity, and
    // absurd values that would overflow Date into a permanently-active comp.
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 8760) {
      return NextResponse.json(
        { error: "Duration must be a whole number of hours between 1 and 8760" },
        { status: 400 }
      );
    }

    // Don't allow overlapping competitions — readers pick the newest row, which
    // would orphan an earlier still-active one. Refuse if one is still running.
    const current = await prisma.benertRemixCompetition.findFirst({
      orderBy: { startedAt: "desc" },
    });
    if (current && current.endsAt > new Date()) {
      return NextResponse.json(
        { error: "A competition is already active" },
        { status: 409 }
      );
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + durationHours * 60 * 60 * 1000);

    await prisma.benertRemixCompetition.create({
      data: {
        startedAt,
        durationHours,
        endsAt,
      },
    });

    return NextResponse.json({
      success: true,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      durationHours,
    });
  } catch (error) {
    console.error("Benert remix admin start error:", error);
    return NextResponse.json(
      { error: "Failed to start competition" },
      { status: 500 }
    );
  }
}
