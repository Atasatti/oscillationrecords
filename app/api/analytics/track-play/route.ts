import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { VISITOR_COOKIE, CONSENT_COOKIE, hasAnalyticsConsent, geoFromHeaders } from "@/lib/consent";

// Force dynamic rendering - prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/analytics/track-play — record a play/view.
// Logged-in users are attributed by userId; consented anonymous visitors by their
// first-party visitor cookie. Visitors with no consent are skipped silently.
export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXTAUTH_SECRET) {
      console.error("NEXTAUTH_SECRET is not configured");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const vid = request.cookies.get(VISITOR_COOKIE)?.value || null;
    const consent = request.cookies.get(CONSENT_COOKIE)?.value || null;

    const body = await request.json();
    const { contentType, contentId, contentName, artistId, artistName, playDuration, completed } = body;
    if (!contentType || !contentId || !contentName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Resolve the listener: a logged-in user, else a consented anonymous visitor.
    let userId: string | null = null;
    if (token?.email) {
      let user = await prisma.user.findUnique({ where: { email: token.email as string } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: token.email as string,
            name: token.name as string,
            image: token.picture as string,
          },
        });
      }
      userId = user.id;
    }

    const anonAllowed = hasAnalyticsConsent(consent) && Boolean(vid);
    if (!userId && !anonAllowed) {
      // No identity and no analytics consent — don't track, but don't error.
      return NextResponse.json({ success: false, skipped: true });
    }

    const { country, city } = geoFromHeaders(request.headers);

    const playEvent = await prisma.playEvent.create({
      data: {
        userId: userId,
        visitorId: userId ? null : vid,
        country,
        city,
        contentType,
        contentId,
        contentName,
        artistId: artistId || null,
        artistName: artistName || null,
        playDuration: playDuration || null,
        completed: completed || false,
      },
    });

    return NextResponse.json({ success: true, playEvent });
  } catch (error) {
    console.error("Error tracking play:", error);
    return NextResponse.json({ error: "Failed to track play" }, { status: 500 });
  }
}
