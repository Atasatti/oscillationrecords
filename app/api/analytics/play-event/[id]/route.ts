import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/analytics/play-event/[id] - Update an existing play event with completion status and duration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { completed, playDuration } = body;

    const user = await prisma.user.findUnique({ where: { email: token.email as string } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const playEvent = await prisma.playEvent.update({
      where: { id, userId: user.id },
      data: {
        ...(typeof completed === "boolean" && { completed }),
        ...(typeof playDuration === "number" && playDuration > 0 && { playDuration }),
      },
    });

    return NextResponse.json({ success: true, playEvent });
  } catch (error) {
    console.error("Error updating play event:", error);
    return NextResponse.json({ error: "Failed to update play event" }, { status: 500 });
  }
}
