import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const short = (v: string | null | undefined) => (v ? v.slice(0, 8) : null);

// Display caps so the Live & raw tables stay bounded no matter the traffic.
const RECENT_ROWS = 20; // recent plays / clicks / visits shown
const LIVE_ROWS = 50; // active sessions shown in "Live now"
const LIVE_SCAN = 1000; // max raw events scanned to compute live presence

// GET /api/analytics/raw — admin-only "everything we store" inspector: live
// presence, recent raw events, and table counts. Deliberately does NOT expose IP
// addresses (we don't store them — see the dashboard notes).
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const now = new Date();
    const liveSince = new Date(now.getTime() - 5 * 60 * 1000);

    // Optional ?date=YYYY-MM-DD (UTC day) focuses the recent-plays list on a
    // single day — matching the dashboard's UTC daily buckets — for the
    // "see these plays" drill-down from the Plays breakdown.
    const dateParam = new URL(request.url).searchParams.get("date");
    const dayStart =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? new Date(`${dateParam}T00:00:00.000Z`)
        : null;
    const dayRange =
      dayStart && !isNaN(dayStart.getTime())
        ? { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) }
        : null;

    const [
      users,
      profiles,
      artists,
      releases,
      tracks,
      playEvents,
      pageViews,
      linkClicks,
      subscribers,
      livePageViews,
      livePlays,
      recentPageViews,
      recentPlays,
      recentClicks,
      recentSignups,
      recentSubscribers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.userProfile.count(),
      prisma.artist.count(),
      prisma.release.count(),
      prisma.track.count(),
      prisma.playEvent.count(),
      prisma.pageView.count(),
      prisma.linkClick.count(),
      prisma.newsletterSubscriber.count(),
      prisma.pageView.findMany({
        where: { createdAt: { gte: liveSince } },
        orderBy: { createdAt: "desc" },
        take: LIVE_SCAN,
        select: { sessionId: true, visitorId: true, userId: true, path: true, country: true, city: true, createdAt: true },
      }),
      prisma.playEvent.findMany({
        where: { createdAt: { gte: liveSince } },
        orderBy: { createdAt: "desc" },
        take: LIVE_SCAN,
        select: { sessionId: true, visitorId: true, userId: true, contentName: true, country: true, city: true, createdAt: true },
      }),
      prisma.pageView.findMany({
        orderBy: { createdAt: "desc" },
        // Fetch a wider window than we display: we collapse these into one row
        // per visit (session) below, so this feeds grouping, not the row count.
        take: 200,
        select: {
          id: true, path: true,
          country: true, city: true, sessionId: true, visitorId: true, userId: true, createdAt: true,
        },
      }),
      prisma.playEvent.findMany({
        // With ?date set, return ALL of that UTC day's plays so the admin sees
        // exactly where the day's count came from; otherwise the recent N.
        where: dayRange ? { createdAt: dayRange } : undefined,
        orderBy: { createdAt: "desc" },
        take: dayRange ? 500 : RECENT_ROWS,
        select: {
          id: true, contentType: true, contentName: true, artistName: true, completed: true,
          country: true, city: true, sessionId: true, visitorId: true, userId: true, createdAt: true,
        },
      }),
      prisma.linkClick.findMany({
        orderBy: { createdAt: "desc" },
        take: RECENT_ROWS,
        select: { id: true, context: true, contextName: true, linkType: true, sessionId: true, visitorId: true, createdAt: true },
      }),
      prisma.user.findMany({ orderBy: { id: "desc" }, take: 10, select: { id: true, name: true, email: true } }),
      prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { email: true, createdAt: true } }),
    ]);

    // Resolve member names for any userIds appearing in the recent/live sets.
    const userIds = new Set<string>();
    [...livePageViews, ...livePlays, ...recentPageViews, ...recentPlays].forEach((r) => {
      if (r.userId) userIds.add(r.userId);
    });
    const userRecords = userIds.size
      ? await prisma.user.findMany({ where: { id: { in: Array.from(userIds) } }, select: { id: true, name: true, email: true } })
      : [];
    const userMap = new Map(userRecords.map((u) => [u.id, u.name || u.email || "Member"]));
    const who = (r: { userId: string | null; visitorId: string | null }) =>
      r.userId ? userMap.get(r.userId) || "Member" : r.visitorId ? "Anonymous" : "Unknown";

    // Live presence: group recent (≤5 min) activity by session (or visitor/user).
    type Live = { key: string; who: string; lastPath: string | null; country: string | null; city: string | null; when: Date };
    const liveMap = new Map<string, Live>();
    const consider = (
      r: { sessionId: string | null; visitorId: string | null; userId: string | null; country: string | null; city: string | null; createdAt: Date },
      path: string | null
    ) => {
      const key = r.sessionId || (r.userId ? `u:${r.userId}` : r.visitorId ? `v:${r.visitorId}` : null);
      if (!key) return;
      const existing = liveMap.get(key);
      if (!existing || r.createdAt > existing.when) {
        liveMap.set(key, { key: short(key)!, who: who(r), lastPath: path ?? existing?.lastPath ?? null, country: r.country, city: r.city, when: r.createdAt });
      }
    };
    livePageViews.forEach((r) => consider(r, r.path));
    livePlays.forEach((r) => consider(r, null));
    const live = Array.from(liveMap.values())
      .sort((a, b) => b.when.getTime() - a.when.getTime())
      .map((l) => ({ ...l, secondsAgo: Math.round((now.getTime() - l.when.getTime()) / 1000) }));

    // Recent visits: collapse raw page views into one row per visit (session,
    // else user/visitor), showing the LATEST page and how many pages they saw.
    // This keeps the list short and makes "where each visitor is now" obvious,
    // instead of a long firehose of every individual page view.
    type Visit = {
      key: string; who: string; lastPath: string; pages: number;
      country: string | null; city: string | null; lastAt: Date;
    };
    const visitMap = new Map<string, Visit>();
    for (const r of recentPageViews) {
      // recentPageViews is newest-first, so the first row per key is the latest.
      const key = r.sessionId || (r.userId ? `u:${r.userId}` : r.visitorId ? `v:${r.visitorId}` : `pv:${r.id}`);
      const existing = visitMap.get(key);
      if (!existing) {
        visitMap.set(key, {
          key: short(key)!, who: who(r), lastPath: r.path, pages: 1,
          country: r.country, city: r.city, lastAt: r.createdAt,
        });
      } else {
        existing.pages += 1;
      }
    }
    const recentVisits = Array.from(visitMap.values())
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .slice(0, RECENT_ROWS);

    return NextResponse.json({
      now: now.toISOString(),
      // Echoes the day filter (if any) so the page can label/scope the plays list.
      playsDate: dayRange ? dateParam : null,
      counts: { users, profiles, artists, releases, tracks, playEvents, pageViews, linkClicks, subscribers },
      // activeSessions is the TRUE count; items is capped for display.
      live: { activeSessions: live.length, items: live.slice(0, LIVE_ROWS) },
      recentVisits,
      recentPlays: recentPlays.map((r) => ({
        id: r.id, contentType: r.contentType, contentName: r.contentName, artistName: r.artistName,
        completed: r.completed, country: r.country, city: r.city, session: short(r.sessionId),
        who: who(r), createdAt: r.createdAt,
      })),
      recentClicks: recentClicks.map((r) => ({
        id: r.id, context: r.context, contextName: r.contextName, linkType: r.linkType,
        session: short(r.sessionId), visitor: short(r.visitorId), createdAt: r.createdAt,
      })),
      // User has no createdAt column — derive it from the Mongo ObjectId timestamp.
      recentSignups: recentSignups.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: new Date(parseInt(u.id.slice(0, 8), 16) * 1000).toISOString(),
      })),
      recentSubscribers,
    });
  } catch (error) {
    console.error("Error fetching raw data:", error);
    return NextResponse.json({ error: "Failed to fetch raw data" }, { status: 500 });
  }
}
