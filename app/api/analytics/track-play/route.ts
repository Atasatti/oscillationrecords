import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  VISITOR_COOKIE,
  CONSENT_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  hasAnalyticsConsent,
  geoFromHeaders,
  nextSessionId,
} from "@/lib/consent";

// "track"/"release" are current; single/album/ep are legacy contentType values.
const VALID_CONTENT_TYPES = new Set(["track", "release", "single", "album", "ep"]);
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const MAX_NAME = 300;

// Force dynamic rendering - prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/analytics/track-play — record a play/view.
// Logged-in users are attributed by userId; consented anonymous visitors by their
// first-party visitor cookie. Visitors with no consent are skipped silently.
export async function POST(request: NextRequest) {
  try {
    // Rate limit this write-heavy public beacon (one PlayEvent per call) to
    // curb row-flooding / play-count inflation. Mirrors pageview/link-click.
    const rl = rateLimit(`trackplay:${clientIp(request)}`, 120, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

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

    // Validate shapes so a script can't poison analytics or trigger DB errors.
    if (typeof contentType !== "string" || !VALID_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Invalid contentType" }, { status: 400 });
    }
    if (typeof contentId !== "string" || !OBJECT_ID.test(contentId)) {
      return NextResponse.json({ error: "Invalid contentId" }, { status: 400 });
    }
    if (artistId != null && (typeof artistId !== "string" || !OBJECT_ID.test(artistId))) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    const safeContentName = String(contentName).slice(0, MAX_NAME);
    const safeArtistName =
      artistName != null ? String(artistName).slice(0, MAX_NAME) : null;
    // Clamp duration to a sane range (0..24h) so it can't be set to junk.
    const rawDuration = Number(playDuration);
    const safeDuration = Number.isFinite(rawDuration)
      ? Math.min(Math.max(Math.trunc(rawDuration), 0), 86_400)
      : null;

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

    // Sessions are an analytics cookie → only with consent. Logged-in users who
    // haven't consented are still tracked, just without a session/visit grouping.
    const consented = hasAnalyticsConsent(consent);
    const sessionId = consented
      ? nextSessionId(request.cookies.get(SESSION_COOKIE)?.value)
      : null;

    const playEvent = await prisma.playEvent.create({
      data: {
        userId: userId,
        visitorId: userId ? null : vid,
        sessionId,
        country,
        city,
        contentType,
        contentId,
        contentName: safeContentName,
        artistId: artistId || null,
        artistName: safeArtistName,
        playDuration: safeDuration,
        completed: completed === true,
      },
    });

    const res = NextResponse.json({ success: true, playEvent });
    if (sessionId) {
      res.cookies.set(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
    }
    return res;
  } catch (error) {
    console.error("Error tracking play:", error);
    return NextResponse.json({ error: "Failed to track play" }, { status: 500 });
  }
}
