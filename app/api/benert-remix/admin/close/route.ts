import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/benert-remix/admin/close - Terminate the current competition (admin only, for testing)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const competition = await prisma.benertRemixCompetition.findFirst({
      orderBy: { startedAt: "desc" },
    });

    if (!competition || competition.endsAt <= new Date()) {
      return NextResponse.json(
        { error: "No active competition to close" },
        { status: 400 }
      );
    }

    await prisma.benertRemixCompetition.update({
      where: { id: competition.id },
      data: { endsAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Benert remix admin close error:", error);
    return NextResponse.json(
      { error: "Failed to close competition" },
      { status: 500 }
    );
  }
}
