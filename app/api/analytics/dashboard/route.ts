import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { canonicalCountry } from "@/lib/country";

// Force dynamic rendering - prevent static generation
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GenderKey = "male" | "female" | "other" | "prefer_not_to_say" | "unknown";
type AgeKey = "18-24" | "25-34" | "35-44" | "45-54" | "55+" | "unknown";

// GET /api/analytics/dashboard?days=30 — admin analytics across logged-in users
// AND consented anonymous visitors. Includes period-over-period deltas, daily
// series for charts, geography, audience, momentum and recent activity.
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const daysRaw = parseInt(searchParams.get("days") || "30", 10);
    const days = Math.min(Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30), 365);
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 86400000);
    const prevStart = new Date(now.getTime() - 2 * days * 86400000);

    const [events, prevEvents, clickRows, prevClicks, totalUsers, pageViews, prevPageViews] =
      await Promise.all([
        prisma.playEvent.findMany({
          where: { createdAt: { gte: startDate } },
          // Lean scalar select — NOT include:{user:{profile}}. Joining a user +
          // profile object onto every event was the dashboard's main cost; we
          // resolve the few logged-in profiles/users in bulk maps below instead.
          select: {
            id: true,
            userId: true,
            visitorId: true,
            sessionId: true,
            contentType: true,
            contentId: true,
            contentName: true,
            artistName: true,
            completed: true,
            country: true,
            city: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.playEvent.findMany({
          where: { createdAt: { gte: prevStart, lt: startDate } },
          select: {
            userId: true,
            visitorId: true,
            sessionId: true,
            contentType: true,
            contentId: true,
            contentName: true,
            completed: true,
          },
        }),
        prisma.linkClick.findMany({
          where: { createdAt: { gte: startDate } },
          select: { createdAt: true, sessionId: true },
        }),
        prisma.linkClick.count({ where: { createdAt: { gte: prevStart, lt: startDate } } }),
        prisma.user.count({ where: { profile: { isNot: null } } }),
        prisma.pageView.findMany({
          where: { createdAt: { gte: startDate } },
          select: { sessionId: true, path: true, utmCampaign: true },
        }),
        prisma.pageView.findMany({
          where: { createdAt: { gte: prevStart, lt: startDate } },
          select: { sessionId: true },
        }),
      ]);

    // Resolve the logged-in identities once, in bulk, rather than joining a user
    // + profile onto every event row. The id set is the number of distinct
    // logged-in members in the window (small), not the event count.
    const memberIds = Array.from(
      new Set(events.map((e) => e.userId).filter((v): v is string => Boolean(v)))
    );
    const [profileRows, userRows] = await Promise.all([
      memberIds.length
        ? prisma.userProfile.findMany({
            where: { userId: { in: memberIds } },
            select: { userId: true, gender: true, ageRange: true, country: true, city: true },
          })
        : Promise.resolve([]),
      memberIds.length
        ? prisma.user.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);
    const profileMap = new Map(profileRows.map((p) => [p.userId, p]));
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    // Identity for an event: logged-in userId, else anonymous visitor id.
    const idOf = (e: { userId: string | null; visitorId: string | null }) =>
      e.userId || (e.visitorId ? `v:${e.visitorId}` : null);
    const isAudio = (t: string) => t !== "release";

    // ---- current-period aggregates ----
    const audio = events.filter((e) => isAudio(e.contentType));
    const releaseViews = events.length - audio.length;
    const completedPlays = audio.filter((e) => e.completed).length;
    const listeners = new Set(audio.map(idOf).filter(Boolean)).size;
    const reachIds = new Set(events.map(idOf).filter(Boolean));
    const anonPlays = events.filter((e) => !e.userId && e.visitorId).length;

    const clicks = clickRows.length;

    // ---- previous-period aggregates (for deltas) ----
    const prevAudio = prevEvents.filter((e) => isAudio(e.contentType));
    const prev = {
      plays: prevAudio.length,
      listeners: new Set(prevAudio.map(idOf).filter(Boolean)).size,
      releaseViews: prevEvents.length - prevAudio.length,
      linkClicks: prevClicks,
    };

    // New vs returning: an identity seen this period that also appeared in the
    // previous period is "returning"; otherwise "new".
    const prevIds = new Set(prevEvents.map(idOf).filter(Boolean));
    let returning = 0;
    reachIds.forEach((id) => {
      if (prevIds.has(id)) returning += 1;
    });
    const newVisitors = reachIds.size - returning;

    // ---- daily series (zero-filled) ----
    const dayKeys: string[] = [];
    {
      // Use UTC day boundaries so the bucket keys match the UTC date keys used
      // by bump() (toISOString). Mixing local setHours with UTC keys dropped
      // events near the day boundary on non-UTC servers.
      const cursor = new Date(startDate);
      cursor.setUTCHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setUTCHours(0, 0, 0, 0);
      while (cursor <= end) {
        dayKeys.push(cursor.toISOString().split("T")[0]);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    const zero = () => new Map(dayKeys.map((d) => [d, 0]));
    const playsMap = zero();
    const playsCompletedMap = zero();
    const viewsMap = zero();
    const clicksMap = zero();
    const bump = (m: Map<string, number>, d: Date) => {
      const k = d.toISOString().split("T")[0];
      if (m.has(k)) m.set(k, (m.get(k) || 0) + 1);
    };
    events.forEach((e) => {
      if (isAudio(e.contentType)) {
        bump(playsMap, e.createdAt);
        if (e.completed) bump(playsCompletedMap, e.createdAt);
      } else {
        bump(viewsMap, e.createdAt);
      }
    });
    clickRows.forEach((c) => bump(clicksMap, c.createdAt));
    const series = {
      // plays carry a full/partial split (completed vs not) for the breakdown.
      plays: dayKeys.map((d) => {
        const count = playsMap.get(d) || 0;
        const completed = playsCompletedMap.get(d) || 0;
        return { date: d, count, completed, partial: count - completed };
      }),
      views: dayKeys.map((d) => ({ date: d, count: viewsMap.get(d) || 0 })),
      clicks: dayKeys.map((d) => ({ date: d, count: clicksMap.get(d) || 0 })),
    };

    // ---- top + rising content (audio only) ----
    const curCounts = new Map<string, { name: string; plays: number; artistName?: string }>();
    audio.forEach((e) => {
      const key = `${e.contentType}-${e.contentId}`;
      const cur = curCounts.get(key) || { name: e.contentName, plays: 0, artistName: e.artistName ?? undefined };
      cur.plays += 1;
      curCounts.set(key, cur);
    });
    const topContent = Array.from(curCounts.entries())
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 50);

    const prevCounts = new Map<string, number>();
    prevAudio.forEach((e) => {
      const key = `${e.contentType}-${e.contentId}`;
      prevCounts.set(key, (prevCounts.get(key) || 0) + 1);
    });
    const risingContent = Array.from(curCounts.entries())
      .map(([id, d]) => ({ id, name: d.name, artistName: d.artistName, plays: d.plays, prev: prevCounts.get(id) || 0 }))
      .map((r) => ({ ...r, delta: r.plays - r.prev }))
      .filter((r) => r.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);

    // ---- top artists (split combined names) ----
    const artistMap = new Map<string, number>();
    audio.forEach((e) => {
      if (!e.artistName) return;
      e.artistName
        .split(/\s*,\s*|\s+ft\.?\s+/i)
        .map((n) => n.trim())
        .filter(Boolean)
        .forEach((name) => artistMap.set(name, (artistMap.get(name) || 0) + 1));
    });
    const topArtistNames = Array.from(artistMap.entries())
      .map(([name, plays]) => ({ name, plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 25);
    // Resolve ids so the dashboard can link artist chips straight to their page.
    const artistRecords = await prisma.artist.findMany({
      where: { name: { in: topArtistNames.map((a) => a.name) } },
      select: { id: true, name: true },
    });
    const nameToId = new Map(artistRecords.map((a) => [a.name, a.id]));
    const topArtists = topArtistNames.map((a) => ({ ...a, id: nameToId.get(a.name) || null }));

    // ---- demographics (logged-in profiles) + geography (event snapshot ?? profile) ----
    const gender: Record<GenderKey, number> = { male: 0, female: 0, other: 0, prefer_not_to_say: 0, unknown: 0 };
    const ageRange: Record<AgeKey, number> = { "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0, unknown: 0 };
    const countryMap = new Map<string, number>();
    const cityMap = new Map<string, number>();
    events.forEach((e) => {
      const profile = e.userId ? profileMap.get(e.userId) ?? null : null;
      const g = (profile?.gender as GenderKey) || "unknown";
      gender[g in gender ? g : "unknown"] += 1;
      const a = (profile?.ageRange as AgeKey) || "unknown";
      ageRange[a in ageRange ? a : "unknown"] += 1;
      // "Where listeners are" must reflect actual listens only. A release-page
      // VIEW also logs an event, so counting every event double-counts a play made
      // on a release page (view + play). Restrict the listener geography to audio
      // plays — one valid listen = one country count.
      if (isAudio(e.contentType)) {
        const country = canonicalCountry(e.country || profile?.country || null);
        if (country) countryMap.set(country, (countryMap.get(country) || 0) + 1);
        const city = e.city || profile?.city || null;
        if (city) cityMap.set(city, (cityMap.get(city) || 0) + 1);
      }
    });
    const topList = (m: Map<string, number>, n: number) =>
      Array.from(m.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);

    // ---- visits / pages-per-visit / top pages / campaigns ----
    const sessionsCur = new Set<string>();
    pageViews.forEach((p) => p.sessionId && sessionsCur.add(p.sessionId));
    events.forEach((e) => e.sessionId && sessionsCur.add(e.sessionId));
    clickRows.forEach((c) => c.sessionId && sessionsCur.add(c.sessionId));
    const visits = sessionsCur.size;
    const pagesPerVisit = visits > 0 ? pageViews.length / visits : 0;

    const prevSessions = new Set<string>();
    prevPageViews.forEach((p) => p.sessionId && prevSessions.add(p.sessionId));
    prevEvents.forEach((e) => e.sessionId && prevSessions.add(e.sessionId));
    const prevVisits = prevSessions.size;

    const pathMap = new Map<string, number>();
    pageViews.forEach((p) => pathMap.set(p.path, (pathMap.get(p.path) || 0) + 1));
    const topPages = topList(pathMap, 50);

    // Campaign attribution: a session's campaign = first UTM seen in its pageviews;
    // plays/clicks in that session are credited to the campaign.
    const sessionCampaign = new Map<string, string>();
    pageViews.forEach((p) => {
      if (p.sessionId && p.utmCampaign && !sessionCampaign.has(p.sessionId)) {
        sessionCampaign.set(p.sessionId, p.utmCampaign);
      }
    });
    const campMap = new Map<string, { sessions: Set<string>; plays: number; clicks: number }>();
    sessionCampaign.forEach((camp, sid) => {
      const c = campMap.get(camp) || { sessions: new Set<string>(), plays: 0, clicks: 0 };
      c.sessions.add(sid);
      campMap.set(camp, c);
    });
    audio.forEach((e) => {
      const camp = e.sessionId ? sessionCampaign.get(e.sessionId) : undefined;
      if (camp) campMap.get(camp)!.plays += 1;
    });
    clickRows.forEach((c) => {
      const camp = c.sessionId ? sessionCampaign.get(c.sessionId) : undefined;
      if (camp) campMap.get(camp)!.clicks += 1;
    });
    const campaigns = Array.from(campMap.entries())
      .map(([name, v]) => ({ name, visits: v.sessions.size, plays: v.plays, clicks: v.clicks }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 25);

    return NextResponse.json({
      days,
      summary: {
        plays: audio.length,
        listeners,
        reach: reachIds.size,
        releaseViews,
        linkClicks: clicks,
        completedPlays,
        completionRate: audio.length > 0 ? (completedPlays / audio.length) * 100 : 0,
        totalUsers,
        anonPlays,
        newVisitors,
        returning,
        visits,
        pageViews: pageViews.length,
        pagesPerVisit,
      },
      previous: { ...prev, visits: prevVisits },
      series,
      topContent,
      risingContent,
      topArtists,
      topPages,
      campaigns,
      demographics: { gender, ageRange },
      geography: { topCountries: topList(countryMap, 50), topCities: topList(cityMap, 50) },
      recentPlays: events.slice(0, 60).map((e) => {
        const u = e.userId ? userMap.get(e.userId) : null;
        return {
        id: e.id,
        userName: u?.name || u?.email || "Anonymous visitor",
        anonymous: !e.userId,
        contentType: e.contentType,
        contentName: e.contentName,
        artistName: e.artistName,
        completed: e.completed,
        createdAt: e.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
