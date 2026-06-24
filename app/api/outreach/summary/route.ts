import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/summary — dashboard counts for the outreach hub
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const now = new Date();

    const [
      totalContacts,
      activePitches,
      openTasks,
      awaitingFollowUp,
      overdueTasksCount,
      acceptedPitches,
    ] = await Promise.all([
      prisma.outreachContact.count(),
      prisma.pitchLog.count({ where: { status: { in: ["not_sent", "sent", "followed_up"] } } }),
      prisma.outreachTask.count({ where: { isTemplate: false, status: { in: ["todo", "in_progress"] } } }),
      prisma.pitchLog.count({ where: { status: "sent", followUpDueAt: { lte: now } } }),
      prisma.outreachTask.count({ where: { isTemplate: false, status: { not: "done" }, dueAt: { lte: now } } }),
      prisma.pitchLog.count({ where: { status: "accepted" } }),
    ]);

    return NextResponse.json(
      { totalContacts, activePitches, openTasks, awaitingFollowUp, overdueTasksCount, acceptedPitches },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Error fetching outreach summary:", error);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
