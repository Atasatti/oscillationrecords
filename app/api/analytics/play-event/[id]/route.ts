import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { VISITOR_COOKIE } from "@/lib/consent";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/analytics/play-event/[id] - finalize a play event (completion + duration).
// Works for logged-in users (matched by userId) and consented anonymous visitors
// (matched by their visitor cookie) — you can only update your own event.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate-limit like the other analytics beacons — the finalize is also a write.
    const rl = rateLimit(`playevent:${clientIp(request)}`, 120, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    if (!process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const vid = request.cookies.get(VISITOR_COOKIE)?.value;

    const { id } = await params;
    const body = await request.json();
    const { completed, playDuration } = body;
    // Integrity: `completed` is one-way (only ever mark complete, never un-complete)
    // and `playDuration` is clamped to 0..24h so a caller can't skew completion-rate
    // / average-listen metrics with a fabricated true + a giant duration.
    const data: { completed?: boolean; playDuration?: number } = {};
    if (completed === true) data.completed = true;
    if (typeof playDuration === "number" && Number.isFinite(playDuration) && playDuration > 0) {
      data.playDuration = Math.min(Math.trunc(playDuration), 86_400);
    }

    // Scope the update to the caller's own event.
    let where: { id: string; userId?: string; visitorId?: string };
    if (token?.email) {
      const user = await prisma.user.findUnique({ where: { email: token.email as string } });
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      where = { id, userId: user.id };
    } else if (vid) {
      where = { id, visitorId: vid };
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const playEvent = await prisma.playEvent.update({ where, data });
    return NextResponse.json({ success: true, playEvent });
  } catch (error) {
    console.error("Error updating play event:", error);
    return NextResponse.json({ error: "Failed to update play event" }, { status: 500 });
  }
}
