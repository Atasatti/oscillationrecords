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
      typeof body.durationHours === "number" ? body.durationHours : 24;

    if (durationHours < 1) {
      return NextResponse.json(
        { error: "Duration must be at least 1 hour" },
        { status: 400 }
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
