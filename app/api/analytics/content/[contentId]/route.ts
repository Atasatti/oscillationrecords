import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import {
  canReadAnalyticsPii,
  logAnalyticsPiiAccess,
  pseudonymize,
} from "@/lib/analytics-privacy";
import { canonicalCountry } from "@/lib/country";

// Force dynamic rendering - prevent static generation
// These exports tell Next.js to never statically generate or analyze this route
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const runtime = 'nodejs';
export const revalidate = 0;

// GET /api/analytics/content/[contentId] - Get detailed analytics for a specific content item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  try {
    const guard = await requirePermission(request, "analytics:read");
    if (!guard.ok) return guard.response;

    // Identifiable rows below (who listened, their email, their demographics) are
    // owner-only; every other role gets the same rows with a stable pseudonym.
    const showPii = await canReadAnalyticsPii(request);
    if (showPii) await logAnalyticsPiiAccess(request, guard.token, "content-detail");

    // Safely await params - handle build-time scenarios
    let contentId: string;
    try {
      const resolvedParams = await params;
      contentId = resolvedParams.contentId;
    } catch (error) {
      console.error("Error resolving params:", error);
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    // Safely get search params
    let searchParams: URLSearchParams;
    try {
      const url = new URL(request.url);
      searchParams = url.searchParams;
    } catch (error) {
      console.error("Error parsing URL:", error);
      return NextResponse.json(
        { error: "Invalid request URL" },
        { status: 400 }
      );
    }
    const contentType = searchParams.get("type") || "track";
    const daysRaw = parseInt(searchParams.get("days") || "30", 10);
    const days = Math.min(Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30), 365);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Play events for this content — LEAN scalar select, NOT include:{user:{profile}}.
    // Joining a user + profile object onto every play row was the heavy cost the
    // sibling dashboard route deliberately avoids; we resolve the few distinct
    // logged-in members' user/profile in bulk maps below instead (#23).
    const playEvents = await prisma.playEvent.findMany({
      where: {
        contentId,
        contentType,
        createdAt: { gte: startDate },
      },
      select: {
        userId: true,
        visitorId: true,
        completed: true,
        playDuration: true,
        country: true,
        city: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Distinct logged-in members in the window (small set), resolved once.
    const memberIds = Array.from(
      new Set(playEvents.map((e) => e.userId).filter((v): v is string => Boolean(v)))
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
    const profileOf = (userId: string | null) => (userId ? profileMap.get(userId) ?? null : null);
    const userOf = (userId: string | null) => (userId ? userMap.get(userId) ?? null : null);

    // Calculate statistics. Identity = logged-in userId, else anonymous visitor id.
    const idOf = (e: { userId: string | null; visitorId: string | null }) =>
      e.userId || (e.visitorId ? `v:${e.visitorId}` : null);
    const totalPlays = playEvents.length;
    const uniqueUsers = new Set(playEvents.map(idOf).filter(Boolean)).size;
    const completedPlays = playEvents.filter(e => e.completed).length;
    const averagePlayDuration = playEvents
      .filter(e => e.playDuration)
      .reduce((sum, e) => sum + (e.playDuration || 0), 0) / 
      (playEvents.filter(e => e.playDuration).length || 1);

    // Demographics breakdown
    const genderStats = {
      male: 0,
      female: 0,
      other: 0,
      prefer_not_to_say: 0,
      unknown: 0,
    };

    const ageRangeStats = {
      "18-24": 0,
      "25-34": 0,
      "35-44": 0,
      "45-54": 0,
      "55+": 0,
      unknown: 0,
    };

    const countryStats = new Map<string, number>();
    const cityStats = new Map<string, number>();

    playEvents.forEach(event => {
      const profile = profileOf(event.userId);
      if (profile?.gender) {
        genderStats[profile.gender as keyof typeof genderStats] =
          (genderStats[profile.gender as keyof typeof genderStats] || 0) + 1;
      } else {
        genderStats.unknown++;
      }
      if (profile?.ageRange) {
        ageRangeStats[profile.ageRange as keyof typeof ageRangeStats] =
          (ageRangeStats[profile.ageRange as keyof typeof ageRangeStats] || 0) + 1;
      } else {
        ageRangeStats.unknown++;
      }
      // Geography prefers the per-event snapshot (covers anonymous), else profile.
      const country = canonicalCountry(event.country || profile?.country || null);
      if (country) countryStats.set(country, (countryStats.get(country) || 0) + 1);
      const city = event.city || profile?.city || null;
      if (city) cityStats.set(city, (cityStats.get(city) || 0) + 1);
    });

    // Plays over time
    const playsByDate = new Map<string, number>();
    playEvents.forEach(event => {
      const date = event.createdAt.toISOString().slice(0, 10);
      playsByDate.set(date, (playsByDate.get(date) || 0) + 1);
    });

    const playsOverTime = Array.from(playsByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Per-play rows — the most identifying thing this endpoint returns: who
    // listened, their email, their demographics, and the city they did it from.
    // Without analytics:pii the identity becomes a stable pseudonym, the email
    // and per-row demographics are dropped, and city is withheld (city + a
    // timestamp + a repeat pseudonym re-identifies someone in a small dataset;
    // the aggregate cityStats below are unaffected and still show reach).
    const userEngagement = playEvents.map(event => {
      const u = userOf(event.userId);
      const profile = profileOf(event.userId);
      const identity = event.userId ?? (event.visitorId ? `v:${event.visitorId}` : null);
      return {
        userId: showPii ? event.userId : null,
        userName: showPii
          ? u?.name || u?.email || "Anonymous visitor"
          : pseudonymize(identity),
        userEmail: showPii ? u?.email || "" : "",
        gender: showPii ? profile?.gender || null : null,
        ageRange: showPii ? profile?.ageRange || null : null,
        country: event.country || profile?.country || null,
        city: showPii ? event.city || profile?.city || null : null,
        playDuration: event.playDuration,
        completed: event.completed,
        createdAt: event.createdAt,
      };
    });

    // Top users by play count
    const userPlayCounts = new Map<string, number>();
    playEvents.forEach(event => {
      const id = idOf(event);
      if (!id) return;
      userPlayCounts.set(id, (userPlayCounts.get(id) || 0) + 1);
    });

    const topUsers = Array.from(userPlayCounts.entries())
      .map(([id, count]) => {
        const userEvent = playEvents.find(e => idOf(e) === id);
        const u = userOf(userEvent?.userId ?? null);
        // "Top listeners" is a per-person ranking, so it's identifiable by
        // construction — pseudonymized (and stripped of the attached profile)
        // for anyone without analytics:pii. The ranking itself still works.
        return {
          userId: showPii ? id : pseudonymize(id),
          userName: showPii
            ? u?.name || u?.email || "Anonymous visitor"
            : pseudonymize(id),
          playCount: count,
          profile: showPii ? profileOf(userEvent?.userId ?? null) ?? undefined : undefined,
        };
      })
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 10);

    return NextResponse.json({
      contentId,
      contentType,
      summary: {
        totalPlays,
        uniqueUsers,
        completedPlays,
        completionRate: totalPlays > 0 ? (completedPlays / totalPlays) * 100 : 0,
        averagePlayDuration: Math.floor(averagePlayDuration),
      },
      demographics: {
        gender: genderStats,
        ageRange: ageRangeStats,
        topCountries: Array.from(countryStats.entries())
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        topCities: Array.from(cityStats.entries())
          .map(([city, count]) => ({ city, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      },
      playsOverTime,
      topUsers,
      userEngagement,
    });
  } catch (error) {
    console.error("Error fetching content analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch content analytics" },
      { status: 500 }
    );
  }
}


