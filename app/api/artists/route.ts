import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractArtistExtras } from "@/lib/artist-input";
import { fuzzyScore } from "@/lib/fuzzy";
import { requireAdmin } from "@/lib/auth-guard";
import { rehostExternalImage } from "@/lib/s3";
import {
  getArtistsPage,
  type ArtistSort,
  type SortDir,
  type ArtistVisibility,
  type ArtistFeatured,
} from "@/lib/admin-data";

// Force dynamic rendering - prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/artists — all artists, or fuzzy search with `?q=` (ignores case/spacing, tolerates typos) and optional `?limit=`.
// `?public=1` returns only artists ticked "Show on website" (admin omits it to manage everything).
// `?page=&pageSize=` (admin) switches to a paginated `{items,total,page,pageSize}`
// envelope (with optional `sort`/`dir`); without those params the response shape
// is unchanged (bare array) so the public site keeps working.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Opt-in pagination (admin tables). Backward-compatible: only when `page` or
    // `pageSize` is present do we return the paginated envelope.
    if (searchParams.has("page") || searchParams.has("pageSize")) {
      // Admin-only management view (hidden artists, play stats, SEO internals).
      const guard = await requireAdmin(request);
      if (!guard.ok) return guard.response;
      const page = parseInt(searchParams.get("page") || "1", 10) || 1;
      const pageSize = parseInt(searchParams.get("pageSize") || "25", 10) || 25;
      const sort = (searchParams.get("sort") || "sortOrder") as ArtistSort;
      const dir = (searchParams.get("dir") || "asc") as SortDir;
      const result = await getArtistsPage({
        page,
        pageSize,
        q: searchParams.get("q") || "",
        sort,
        dir,
        filters: {
          visibility: (searchParams.get("visibility") || "all") as ArtistVisibility,
          featured: (searchParams.get("featured") || "all") as ArtistFeatured,
          genre: searchParams.get("genre") || "",
        },
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

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
    // Explicit select: this (legacy/bare-array) branch feeds the public client
    // sections, so it must NEVER ship internal fields (realName, contact,
    // managerName, internalNotes, spotifyId, etc.). Keep keys public-safe.
    const artists = await prisma.artist.findMany({
      ...(publicOnly ? { where: { showOnWebsite: true } } : {}),
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        biography: true,
        profilePicture: true,
        genres: true,
        xLink: true,
        tiktokLink: true,
        spotifyLink: true,
        instagramLink: true,
        youtubeLink: true,
        facebookLink: true,
        appleMusicLink: true,
        tidalLink: true,
        amazonMusicLink: true,
        soundcloudLink: true,
        sortOrder: true,
        showOnWebsite: true,
        createdAt: true,
        updatedAt: true,
      },
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

    // Re-host any external photo (e.g. a Spotify i.scdn.co URL from import) onto
    // our own S3 so the image file is ours — best-effort, keeps the original URL
    // if the copy fails. See rehostExternalImage in lib/s3.ts.
    const finalPicture = profilePicture
      ? (await rehostExternalImage(profilePicture, name)) ?? profilePicture
      : profilePicture;

    const artist = await prisma.artist.create({
      data: {
        name,
        biography,
        profilePicture: finalPicture,
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
        ...extractArtistExtras(body),
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
