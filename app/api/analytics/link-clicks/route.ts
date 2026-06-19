import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/analytics/link-clicks?days=30 — click-through analytics on outbound
// streaming / social links (admin only). Aggregates the LinkClick collection and
// cross-references release page views (PlayEvent contentType "release") for CTR.
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const daysRaw = parseInt(searchParams.get("days") || "30", 10);
    const days = Math.min(Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30), 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [clicks, releaseViews] = await Promise.all([
      prisma.linkClick.findMany({
        where: { createdAt: { gte: startDate } },
        orderBy: { createdAt: "desc" },
      }),
      // Release detail page views, used as the denominator for release CTR.
      prisma.playEvent.findMany({
        where: { createdAt: { gte: startDate }, contentType: "release" },
        select: { contentId: true },
      }),
    ]);

    const totalClicks = clicks.length;

    // Per-platform breakdown.
    const byLinkTypeMap = new Map<string, number>();
    // Per-context breakdown (release / track / artist).
    const byContextMap = new Map<string, number>();
    // Per-target rollup keyed by context+contextId.
    const targetMap = new Map<
      string,
      {
        context: string;
        contextId: string;
        name: string;
        clicks: number;
        byType: Record<string, number>;
      }
    >();
    // Daily series.
    const byDateMap = new Map<string, number>();

    for (const c of clicks) {
      byLinkTypeMap.set(c.linkType, (byLinkTypeMap.get(c.linkType) || 0) + 1);
      byContextMap.set(c.context, (byContextMap.get(c.context) || 0) + 1);

      const key = `${c.context}-${c.contextId}`;
      const target =
        targetMap.get(key) || {
          context: c.context,
          contextId: c.contextId,
          name: c.contextName || "(unknown)",
          clicks: 0,
          byType: {} as Record<string, number>,
        };
      target.clicks++;
      target.byType[c.linkType] = (target.byType[c.linkType] || 0) + 1;
      if (c.contextName) target.name = c.contextName;
      targetMap.set(key, target);

      const date = c.createdAt.toISOString().split("T")[0];
      byDateMap.set(date, (byDateMap.get(date) || 0) + 1);
    }

    const byLinkType = Array.from(byLinkTypeMap.entries())
      .map(([linkType, count]) => ({ linkType, count }))
      .sort((a, b) => b.count - a.count);

    const byContext = Array.from(byContextMap.entries())
      .map(([context, count]) => ({ context, count }))
      .sort((a, b) => b.count - a.count);

    const topLinks = Array.from(targetMap.values())
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 15);

    const clicksOverTime = Array.from(byDateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // CTR: release page views vs outbound link clicks on that release.
    const viewsByRelease = new Map<string, number>();
    for (const v of releaseViews) {
      viewsByRelease.set(v.contentId, (viewsByRelease.get(v.contentId) || 0) + 1);
    }
    const ctrByRelease = Array.from(targetMap.values())
      .filter((t) => t.context === "release")
      .map((t) => {
        const views = viewsByRelease.get(t.contextId) || 0;
        return {
          contextId: t.contextId,
          name: t.name,
          clicks: t.clicks,
          views,
          ctr: views > 0 ? (t.clicks / views) * 100 : null,
        };
      })
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 15);

    return NextResponse.json({
      summary: {
        totalClicks,
        uniqueTargets: targetMap.size,
      },
      byLinkType,
      byContext,
      topLinks,
      ctrByRelease,
      clicksOverTime,
    });
  } catch (error) {
    console.error("Error fetching link-click analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch link-click analytics" },
      { status: 500 }
    );
  }
}
