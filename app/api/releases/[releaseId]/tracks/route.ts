import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { prismaKindToApi, normalizeFeatureArtistNamesInput, serializeTrack } from "@/lib/release-format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/releases/[releaseId]/tracks — add a track (full former-single fields)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { releaseId } = await params;
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
    });
    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      image,
      audioFile,
      duration,
      releaseDate,
      composer,
      lyricist,
      leadVocal,
      lyrics,
      stemsFile,
      trackCredits,
      isrcCode,
      iswc,
      isrcExplicit,
      spotifyLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      youtubeLink,
      soundcloudLink,
      primaryArtistIds,
      featureArtistIds,
      featureArtistNames: featureArtistNamesRaw,
    } = body;

    if (!name || !audioFile || duration === undefined || duration === null) {
      return NextResponse.json(
        { error: "name, audioFile, and duration are required" },
        { status: 400 }
      );
    }
    if (!isrcCode || !String(isrcCode).trim()) {
      return NextResponse.json(
        { error: "isrcCode is required" },
        { status: 400 }
      );
    }

    const dur = parseInt(String(duration), 10);
    if (!Number.isFinite(dur) || dur < 0) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
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

    const maxOrder = await prisma.track.aggregate({
      where: { releaseId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const track = await prisma.track.create({
      data: {
        releaseId,
        sortOrder,
        name: String(name),
        image: image ? String(image) : null,
        audioFile: String(audioFile),
        duration: dur,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        composer: composer ? String(composer) : null,
        lyricist: lyricist ? String(lyricist) : null,
        leadVocal: leadVocal ? String(leadVocal) : null,
        lyrics: lyrics ? String(lyrics) : null,
        stemsFile: stemsFile ? String(stemsFile) : null,
        trackCredits:
          trackCredits !== undefined && trackCredits !== null
            ? trackCredits
            : null,
        isrcCode: isrcCode ? String(isrcCode) : null,
        iswc: iswc ? String(iswc).trim() : null,
        isrcExplicit: Boolean(isrcExplicit),
        spotifyLink: spotifyLink || null,
        appleMusicLink: appleMusicLink || null,
        tidalLink: tidalLink || null,
        amazonMusicLink: amazonMusicLink || null,
        youtubeLink: youtubeLink || null,
        soundcloudLink: soundcloudLink || null,
        primaryArtistIds,
        featureArtistIds: featIds,
        featureArtistNames: featManual,
      },
    });

    return NextResponse.json(
      {
        ...serializeTrack(track),
        releaseId: track.releaseId,
        releaseType: prismaKindToApi(release.kind),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating track:", error);
    return NextResponse.json(
      { error: "Failed to create track" },
      { status: 500 }
    );
  }
}
