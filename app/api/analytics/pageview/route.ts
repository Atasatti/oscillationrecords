import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  CONSENT_COOKIE,
  VISITOR_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  hasAnalyticsConsent,
  geoFromHeaders,
  nextSessionId,
  parseUtm,
} from "@/lib/consent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/analytics/pageview — consented page-view beacon. Powers visits,
// pages-per-visit, top pages and campaign (UTM) attribution. Slides the session
// cookie so a 30-min gap starts a new visit.
export async function POST(request: NextRequest) {
  const rl = rateLimit(`pageview:${clientIp(request)}`, 240, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429 });

  try {
    const consent = request.cookies.get(CONSENT_COOKIE)?.value || null;
    if (!hasAnalyticsConsent(consent)) {
      return NextResponse.json({ ok: false, skipped: true });
    }

    const body = await request.json();
    const path = String(body?.path || "").slice(0, 300);
    if (!path) return NextResponse.json({ ok: false }, { status: 400 });
    const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 300) : null;
    const utm = parseUtm(typeof body?.search === "string" ? body.search : "");

    let userId: string | null = null;
    if (process.env.NEXTAUTH_SECRET) {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
      if (token?.email) {
        const u = await prisma.user.findUnique({ where: { email: token.email as string } });
        userId = u?.id ?? null;
      }
    }

    const vid = request.cookies.get(VISITOR_COOKIE)?.value || null;
    const sessionId = nextSessionId(request.cookies.get(SESSION_COOKIE)?.value);
    const { country, city } = geoFromHeaders(request.headers);

    await prisma.pageView.create({
      data: { userId, visitorId: vid, sessionId, path, referrer, ...utm, country, city },
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (error) {
    console.error("pageview error:", error);
    return NextResponse.json({ ok: false });
  }
}
