import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

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
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

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

    // Get all play events for this content
    const playEvents = await prisma.playEvent.findMany({
      where: {
        contentId,
        contentType,
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

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
      const profile = event.user?.profile ?? null;
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
      const country = event.country || profile?.country || null;
      if (country) countryStats.set(country, (countryStats.get(country) || 0) + 1);
      const city = event.city || profile?.city || null;
      if (city) cityStats.set(city, (cityStats.get(city) || 0) + 1);
    });

    // Plays over time
    const playsByDate = new Map<string, number>();
    playEvents.forEach(event => {
      const date = event.createdAt.toISOString().split('T')[0];
      playsByDate.set(date, (playsByDate.get(date) || 0) + 1);
    });

    const playsOverTime = Array.from(playsByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // User engagement details
    const userEngagement = playEvents.map(event => ({
      userId: event.userId,
      userName: event.user?.name || event.user?.email || "Anonymous visitor",
      userEmail: event.user?.email || "",
      gender: event.user?.profile?.gender || null,
      ageRange: event.user?.profile?.ageRange || null,
      country: event.country || event.user?.profile?.country || null,
      city: event.city || event.user?.profile?.city || null,
      playDuration: event.playDuration,
      completed: event.completed,
      createdAt: event.createdAt,
    }));

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
        return {
          userId: id,
          userName: userEvent?.user?.name || userEvent?.user?.email || "Anonymous visitor",
          playCount: count,
          profile: userEvent?.user?.profile ?? undefined,
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


