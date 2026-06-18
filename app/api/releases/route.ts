import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fuzzyScore } from "@/lib/fuzzy";
import { isAdminRequest, requireAdmin } from "@/lib/auth-guard";
import { mapReleasesToCards, releaseCardListArgs, publicReleaseWhere } from "@/lib/catalog-data";
import { getReleasesPage, type ReleaseSort, type SortDir } from "@/lib/admin-data";
import {
  apiKindToPrisma,
  normalizeFeatureArtistNamesInput,
  prismaKindToApi,
} from "@/lib/release-format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases — list releases for public grid (optional `?limit=`; `?carousel=1` returns all `showOnHome` releases with no cap, or all releases if none flagged)
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminRequest(request);

    const { searchParams } = new URL(request.url);

    // Opt-in pagination (admin table). Backward-compatible: only when `page`/
    // `pageSize` is present do we return the `{items,total,page,pageSize}` envelope;
    // otherwise the response stays the existing bare array (public site, carousel).
    if (searchParams.has("page") || searchParams.has("pageSize")) {
      const statusParam = searchParams.get("status");
      const result = await getReleasesPage({
        page: parseInt(searchParams.get("page") || "1", 10) || 1,
        pageSize: parseInt(searchParams.get("pageSize") || "25", 10) || 25,
        q: searchParams.get("q") || "",
        sort: (searchParams.get("sort") || "createdAt") as ReleaseSort,
        dir: (searchParams.get("dir") || "desc") as SortDir,
        status:
          statusParam === "DRAFT" || statusParam === "SCHEDULED" || statusParam === "RELEASED"
            ? statusParam
            : undefined,
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const limitRaw = searchParams.get("limit");
    let take: number | undefined;
    if (limitRaw !== null && limitRaw !== "") {
      const n = parseInt(limitRaw, 10);
      if (Number.isFinite(n) && n > 0) {
        take = Math.min(n, 100);
      }
    }

    const carouselOnly = searchParams.get("carousel") === "1";
    const qParam = (searchParams.get("q") || "").trim();

    // Shared with the Server Components via lib/catalog-data so the card shape
    // can't drift between the initial HTML and client fetches.
    const baseList = releaseCardListArgs;
    // Public callers only ever see released (or now-due scheduled) releases;
    // admins see everything. undefined `where` is ignored by Prisma.
    const where = isAdmin ? undefined : publicReleaseWhere();

    let releases;
    if (carouselOnly) {
      // Pin + auto-fill: releases flagged "New Music carousel" (showOnHome) come
      // first in their admin (sortOrder) order, then the rest auto-fill newest
      // first. New releases therefore appear automatically without being flagged,
      // and the newest cycle to the front. Capped so it stays a highlight reel.
      const all = await prisma.release.findMany({ ...baseList, where });
      const pinned = all
        .filter((r) => r.showOnHome)
        .sort((a, b) => a.homeOrder - b.homeOrder);
      const rest = all
        .filter((r) => !r.showOnHome)
        .sort((a, b) => {
          const ta = (a.releaseDate ? new Date(a.releaseDate) : new Date(a.createdAt)).getTime();
          const tb = (b.releaseDate ? new Date(b.releaseDate) : new Date(b.createdAt)).getTime();
          return tb - ta;
        });
      releases = [...pinned, ...rest].slice(0, 12);
    } else if (qParam.length > 0) {
      // Fuzzy match in JS (catalog is small) so "bigheck" still finds
      // releases by "Big Heck" — against release name, linked artists, and
      // manually entered feature names.
      const allArtists = await prisma.artist.findMany({
        select: { id: true, name: true },
      });
      const matchedArtistIds = new Set(
        allArtists
          .filter((a) => fuzzyScore(qParam, a.name) > 0)
          .map((a) => a.id)
      );

      const all = await prisma.release.findMany({ ...baseList, where });
      releases = all
        .map((r) => {
          const artistHit =
            r.primaryArtistIds.some((id) => matchedArtistIds.has(String(id))) ||
            r.featureArtistIds.some((id) => matchedArtistIds.has(String(id)));
          const score = Math.max(
            fuzzyScore(qParam, r.name),
            ...(r.featureArtistNames || []).map((n) => fuzzyScore(qParam, n)),
            artistHit ? 75 : 0
          );
          return { r, score };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .map((x) => x.r);
      if (take !== undefined) releases = releases.slice(0, take);
    } else {
      releases = await prisma.release.findMany({
        ...(take !== undefined ? { take } : {}),
        ...baseList,
        where,
      });
    }

    const out = await mapReleasesToCards(releases, { isAdmin });

    // Cache the public response at the CDN (results vary by query string, which
    // is part of the cache key). Admin responses include private fields, so they
    // are never shared-cached.
    return NextResponse.json(out, {
      headers: {
        "Cache-Control": isAdmin
          ? "private, no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}

// POST /api/releases — create release shell (tracks added separately)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const kind = apiKindToPrisma(body.kind);
    if (!kind) {
      return NextResponse.json(
        { error: "kind must be single, ep, or album" },
        { status: 400 }
      );
    }

    const {
      name,
      coverImage,
      releaseDate,
      description,
      primaryGenre,
      secondaryGenre,
      spotifyLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      youtubeLink,
      soundcloudLink,
      isrcExplicit,
      upcCode,
      catalogueNumber,
      pLine,
      cLine,
      primaryArtistIds,
      featureArtistIds,
      featureArtistNames: featureArtistNamesRaw,
    } = body;

    const status = ["DRAFT", "SCHEDULED", "RELEASED"].includes(String(body.status))
      ? (body.status as "DRAFT" | "SCHEDULED" | "RELEASED")
      : "RELEASED";
    const preSaveUrl =
      typeof body.preSaveUrl === "string" && body.preSaveUrl.trim()
        ? body.preSaveUrl.trim()
        : null;

    if (!name || !coverImage) {
      return NextResponse.json(
        { error: "name and coverImage are required" },
        { status: 400 }
      );
    }

    // A scheduled (Coming Soon) release must be dated in the future.
    if (status === "SCHEDULED") {
      const d = releaseDate ? new Date(releaseDate) : null;
      if (!d || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "Scheduled releases must use a future release date" },
          { status: 400 }
        );
      }
    }

    if (
      !primaryArtistIds ||
      !Array.isArray(primaryArtistIds) ||
      primaryArtistIds.length === 0
    ) {
      return NextResponse.json(
        { error: "At least one primary artist is required" },
        { status: 400 }
      );
    }

    const primaryArtists = await prisma.artist.findMany({
      where: { id: { in: primaryArtistIds } },
    });
    if (primaryArtists.length !== primaryArtistIds.length) {
      return NextResponse.json(
        { error: "One or more primary artists not found" },
        { status: 404 }
      );
    }

    const featIds = featureArtistIds || [];
    const featManual = normalizeFeatureArtistNamesInput(featureArtistNamesRaw);
    if (featIds.length > 0) {
      const featureArtists = await prisma.artist.findMany({
        where: { id: { in: featIds } },
      });
      if (featureArtists.length !== featIds.length) {
        return NextResponse.json(
          { error: "One or more feature artists not found" },
          { status: 404 }
        );
      }
    }

    const minOrder = await prisma.release.aggregate({
      _min: { sortOrder: true },
    });
    const sortOrder = (minOrder._min.sortOrder ?? 0) - 1;

    const release = await prisma.release.create({
      data: {
        kind,
        name: String(name),
        coverImage: String(coverImage),
        primaryArtistIds,
        featureArtistIds: featIds,
        featureArtistNames: featManual,
        sortOrder,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        description: description ? String(description) : null,
        primaryGenre: primaryGenre ? String(primaryGenre) : null,
        secondaryGenre: secondaryGenre ? String(secondaryGenre) : null,
        spotifyLink: spotifyLink || null,
        appleMusicLink: appleMusicLink || null,
        tidalLink: tidalLink || null,
        amazonMusicLink: amazonMusicLink || null,
        youtubeLink: youtubeLink || null,
        soundcloudLink: soundcloudLink || null,
        isrcExplicit: Boolean(isrcExplicit),
        upcCode:
          upcCode != null && String(upcCode).trim() !== ""
            ? String(upcCode).trim()
            : null,
        catalogueNumber: catalogueNumber ? String(catalogueNumber).trim() : null,
        pLine: pLine ? String(pLine).trim() : null,
        cLine: cLine ? String(cLine).trim() : null,
        status,
        preSaveUrl,
      },
      include: { tracks: { orderBy: { sortOrder: "asc" } } },
    });

    const allArtistIds = [
      ...release.primaryArtistIds,
      ...release.featureArtistIds,
    ];
    const artists = await prisma.artist.findMany({
      where: { id: { in: allArtistIds } },
      select: { id: true, name: true, profilePicture: true },
    });

    return NextResponse.json(
      {
        ...release,
        type: prismaKindToApi(release.kind),
        songs: release.tracks,
        tracks: release.tracks,
        artists,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating release:", error);
    return NextResponse.json(
      { error: "Failed to create release" },
      { status: 500 }
    );
  }
}
