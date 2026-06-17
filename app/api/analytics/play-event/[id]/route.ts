import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
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
    if (!process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const vid = request.cookies.get(VISITOR_COOKIE)?.value;

    const { id } = await params;
    const body = await request.json();
    const { completed, playDuration } = body;
    const data = {
      ...(typeof completed === "boolean" && { completed }),
      ...(typeof playDuration === "number" && playDuration > 0 && { playDuration }),
    };

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
