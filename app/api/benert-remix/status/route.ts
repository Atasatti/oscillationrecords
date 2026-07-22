import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/benert-remix/status - Get current user's submission status (auth required)
export async function GET(request: NextRequest) {
  try {
    // A live account is required — a stale token from a deleted account used to
    // get a cheerful `hasUploaded: false` here instead of being turned away.
    const guard = await requireUser(request);
    if (!guard.ok) return guard.response;

    const entry = await prisma.benertRemixEntry.findUnique({
      where: { userId: guard.userId },
    });

    // Only the boolean — the entry's object URL is never handed back to the
    // client (audit #1). The file is private; an entrant who needs it goes
    // through /api/assets/download, which re-checks ownership.
    return NextResponse.json({ hasUploaded: !!entry?.uploadedFileUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Benert remix status error:", message);
    return NextResponse.json(
      { error: "Failed to get status" },
      { status: 500 }
    );
  }
}
