import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

// Force dynamic rendering - prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/analytics/dashboard - Get dashboard analytics data (admin only)
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all play events in the date range
    const playEvents = await prisma.playEvent.findMany({
      where: {
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

    // Get total users with profiles
    const totalUsers = await prisma.user.count({
      where: {
        profile: {
          isNot: null,
        },
      },
    });

    // Calculate statistics
    const totalPlays = playEvents.length;
    const uniqueUsers = new Set(playEvents.map(e => e.userId)).size;
    const completedPlays = playEvents.filter(e => e.completed).length;

    const playsByType = {
      track: playEvents.filter((e) => e.contentType === "track").length,
      release: playEvents.filter((e) => e.contentType === "release").length,
      single: playEvents.filter((e) => e.contentType === "single").length,
      album: playEvents.filter((e) => e.contentType === "album").length,
      ep: playEvents.filter((e) => e.contentType === "ep").length,
    };

    // Top content — exclude release page views, only count actual audio plays
    const contentMap = new Map<string, { name: string; plays: number; artistName?: string }>();
    playEvents.filter(e => e.contentType !== "release").forEach(event => {
      const key = `${event.contentType}-${event.contentId}`;
      const existing = contentMap.get(key) || { name: event.contentName, plays: 0, artistName: event.artistName ?? undefined };
      existing.plays++;
      contentMap.set(key, existing);
    });

    const topContent = Array.from(contentMap.entries())
      .map(([key, data]) => ({
        id: key,
        ...data,
      }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10);

    // Demographics
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

    playEvents.forEach(event => {
      const profile = event.user.profile;
      if (profile) {
        if (profile.gender) {
          genderStats[profile.gender as keyof typeof genderStats] = 
            (genderStats[profile.gender as keyof typeof genderStats] || 0) + 1;
        } else {
          genderStats.unknown++;
        }

        if (profile.ageRange) {
          ageRangeStats[profile.ageRange as keyof typeof ageRangeStats] = 
            (ageRangeStats[profile.ageRange as keyof typeof ageRangeStats] || 0) + 1;
        } else {
          ageRangeStats.unknown++;
        }
      } else {
        genderStats.unknown++;
        ageRangeStats.unknown++;
      }
    });

    // Plays over time (daily)
    const playsByDate = new Map<string, number>();
    playEvents.forEach(event => {
      const date = event.createdAt.toISOString().split('T')[0];
      playsByDate.set(date, (playsByDate.get(date) || 0) + 1);
    });

    const playsOverTime = Array.from(playsByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top artists — split combined names like "BSK, Big Heck" or "BSK ft SILVER D.A"
    const artistMap = new Map<string, number>();
    playEvents.forEach(event => {
      if (event.artistName) {
        const individuals = event.artistName
          .split(/\s*,\s*|\s+ft\.?\s+/i)
          .map(name => name.trim())
          .filter(Boolean);
        individuals.forEach(name => {
          artistMap.set(name, (artistMap.get(name) || 0) + 1);
        });
      }
    });

    const topArtists = Array.from(artistMap.entries())
      .map(([name, plays]) => ({ name, plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        totalPlays,
        uniqueUsers,
        completedPlays,
        completionRate: totalPlays > 0 ? (completedPlays / totalPlays) * 100 : 0,
        totalUsers,
      },
      playsByType,
      topContent,
      topArtists,
      demographics: {
        gender: genderStats,
        ageRange: ageRangeStats,
      },
      playsOverTime,
      recentPlays: playEvents.slice(0, 60).map(event => ({
        id: event.id,
        userName: event.user.name || event.user.email,
        contentType: event.contentType,
        contentName: event.contentName,
        artistName: event.artistName,
        completed: event.completed,
        createdAt: event.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}

