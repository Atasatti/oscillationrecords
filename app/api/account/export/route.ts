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

  // token.sub is the OAuth (Google) subject, NOT our Mongo user id — resolve the
  // account by email (the unique login key), then read everything by that id.
  // (Using token.sub directly threw "Malformed ObjectID" on every export.)
  const email = guard.token.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "No account email on session" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, image: true, emailVerified: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    const userId = user.id;

    const [profile, playEvents, remixEntry, newsletter] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.playEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.benertRemixEntry.findUnique({ where: { userId } }),
      prisma.newsletterSubscriber.findUnique({ where: { email } }),
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
