import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/benert-remix/status - Get current user's submission status (auth required)
export async function GET(request: NextRequest) {
  try {
    if (!process.env.NEXTAUTH_SECRET) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.sub || !token?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: token.email as string },
    });

    if (!user) {
      return NextResponse.json({ hasUploaded: false });
    }

    const entry = await prisma.benertRemixEntry.findUnique({
      where: { userId: user.id },
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
