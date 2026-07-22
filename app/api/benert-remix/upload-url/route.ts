import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/benert-remix/upload-url - Validate user can upload (competition active, not uploaded yet)
export async function POST(request: NextRequest) {
  try {
    // Requires a live account: this used to CREATE the user row when none was
    // found, which meant a stale token from a deleted account silently
    // resurrected it. Accounts are only ever created by signing in (the NextAuth
    // jwt callback's upsert).
    const guard = await requireUser(request);
    if (!guard.ok) return guard.response;

    // Rate-limit per user so this session-authed route can't be replayed to churn
    // competition reads unthrottled.
    const rl = rateLimit(`benertupload:${guard.token.sub}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

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
      where: { userId: guard.userId },
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
