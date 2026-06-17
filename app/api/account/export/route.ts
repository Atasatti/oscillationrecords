import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/account/export — GDPR data portability: returns everything we hold
// about the signed-in user as a downloadable JSON file. OAuth tokens are
// deliberately excluded (data minimisation — they aren't useful to the user and
// would be sensitive if the export leaked).
export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  const userId = guard.token.sub!;
  const email = guard.token.email ?? null;

  try {
    const [user, profile, playEvents, remixEntry, newsletter] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          emailVerified: true,
        },
      }),
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.playEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.benertRemixEntry.findUnique({ where: { userId } }),
      email ? prisma.newsletterSubscriber.findUnique({ where: { email } }) : null,
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      account: user,
      profile,
      listeningHistory: playEvents,
      competitionEntry: remixEntry,
      newsletter,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition":
          'attachment; filename="oscillation-records-my-data.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("account export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
