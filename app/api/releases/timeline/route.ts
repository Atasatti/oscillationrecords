import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type TimelineItem = {
  id: string;
  name: string;
  status: "SCHEDULED" | "RELEASED";
  releaseDate: string; // ISO — always present on the timeline
  coverImage: string;
  artistNames: string[];
};

// GET /api/releases/timeline — the release rollout: dated SCHEDULED (upcoming) +
// RELEASED (from the last 6 months) releases, oldest→newest. Catalog-gated.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const releases = await prisma.release.findMany({
      where: {
        status: { in: ["SCHEDULED", "RELEASED"] },
        releaseDate: { not: null, gte: since },
      },
      select: {
        id: true,
        name: true,
        status: true,
        coverImage: true,
        releaseDate: true,
        primaryArtistIds: true,
      },
    });

    const artistIds = [...new Set(releases.flatMap((r) => r.primaryArtistIds))];
    const artists = artistIds.length
      ? await prisma.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true, name: true } })
      : [];
    const artistName = new Map(artists.map((a) => [a.id, a.name]));

    const items: TimelineItem[] = releases
      .filter((r) => r.releaseDate)
      .map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status as "SCHEDULED" | "RELEASED",
        releaseDate: r.releaseDate!.toISOString(),
        coverImage: r.coverImage,
        artistNames: r.primaryArtistIds.map((id) => artistName.get(id)).filter((n): n is string => Boolean(n)),
      }))
      .sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());

    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release timeline GET error:", e);
    return NextResponse.json({ error: "Failed to load timeline" }, { status: 500 });
  }
}
