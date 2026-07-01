import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/benert-remix/upload-url - Validate user can upload (competition active, not uploaded yet)
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.sub || !token?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate-limit per user so this session-authed route can't be replayed to churn
    // user-row creation / competition reads unthrottled.
    const rl = rateLimit(`benertupload:${token.sub}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    let user = await prisma.user.findUnique({
      where: { email: token.email as string },
    });

    // If user signed in with Google but was never synced to DB (e.g. before auth sync existed), create them now
    if (!user && token.email) {
      user = await prisma.user.create({
        data: {
          email: token.email as string,
          name: (token.name as string) ?? null,
          image: (token.picture as string) ?? null,
        },
      });
    }

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 400 }
      );
    }

    // Check competition is active
    const competition = await prisma.benertRemixCompetition.findFirst({
      orderBy: { startedAt: "desc" },
    });

    if (!competition || competition.endsAt <= new Date()) {
      return NextResponse.json(
        { error: "Competition is not active or has ended" },
        { status: 400 }
      );
    }

    const entry = await prisma.benertRemixEntry.findUnique({
      where: { userId: user.id },
    });

    if (entry?.uploadedFileUrl) {
      return NextResponse.json(
        { error: "You have already submitted your remix" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Benert remix upload-url validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate upload" },
      { status: 500 }
    );
  }
}
