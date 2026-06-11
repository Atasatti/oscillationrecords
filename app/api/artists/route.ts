import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fuzzyScore } from "@/lib/fuzzy";
import { requireAdmin } from "@/lib/auth-guard";

// Force dynamic rendering - prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/artists — all artists, or fuzzy search with `?q=` (ignores case/spacing, tolerates typos) and optional `?limit=`.
// `?public=1` returns only artists ticked "Show on website" (admin omits it to manage everything).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const publicOnly = searchParams.get("public") === "1";
    const limitRaw = searchParams.get("limit");
    let take: number | undefined;
    if (limitRaw !== null && limitRaw !== "") {
      const n = parseInt(limitRaw, 10);
      if (Number.isFinite(n) && n > 0) {
        take = Math.min(n, 100);
      }
    }

    // Mongo docs missing the field don't match this filter — every Artist doc
    // must carry showOnWebsite (backfilled 2026-06; create sets it explicitly).
    const artists = await prisma.artist.findMany({
      ...(publicOnly ? { where: { showOnWebsite: true } } : {}),
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    // Fuzzy match in JS (roster is small) so "bigheck" still finds "Big Heck".
    let out = artists;
    if (q.length > 0) {
      out = artists
        .map((artist) => ({ artist, score: fuzzyScore(q, artist.name) }))
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .map((x) => x.artist);
    }
    if (take !== undefined) out = out.slice(0, take);

    return NextResponse.json(out, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching artists:", error);
    return NextResponse.json(
      { error: "Failed to fetch artists" },
      { status: 500 }
    );
  }
}

// POST /api/artists - Create a new artist
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const {
      name,
      biography,
      profilePicture,
      composer,
      lyricist,
      leadVocal,
      xLink,
      tiktokLink,
      spotifyLink,
      instagramLink,
      youtubeLink,
      facebookLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      soundcloudLink,
    } = body;

    // Validate required fields
    if (!name || !biography) {
      return NextResponse.json(
        { error: "Name and biography are required" },
        { status: 400 }
      );
    }

    const maxOrder = await prisma.artist.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const artist = await prisma.artist.create({
      data: {
        name,
        biography,
        profilePicture,
        composer: composer || null,
        lyricist: lyricist || null,
        leadVocal: leadVocal || null,
        xLink,
        tiktokLink,
        spotifyLink,
        instagramLink,
        youtubeLink,
        facebookLink,
        appleMusicLink: appleMusicLink || null,
        tidalLink: tidalLink || null,
        amazonMusicLink: amazonMusicLink || null,
        soundcloudLink: soundcloudLink || null,
        sortOrder,
        showOnWebsite: true,
      },
    });

    return NextResponse.json(artist, { status: 201 });
  } catch (error) {
    console.error("Error creating artist:", error);
    return NextResponse.json(
      { error: "Failed to create artist" },
      { status: 500 }
    );
  }
}
