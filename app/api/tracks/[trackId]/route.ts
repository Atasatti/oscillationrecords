import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { serializeTrack, serializeTrackForPublic, normalizeFeatureArtistNamesInput } from "@/lib/release-format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_EMAIL = "oscillationrecordz@gmail.com";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  try {
    const { trackId } = await params;
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { release: true },
    });
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const isAdmin = Boolean(token?.email && token.email === ADMIN_EMAIL);
    const serialized = isAdmin ? serializeTrack(track) : serializeTrackForPublic(track);
    return NextResponse.json({
      ...serialized,
      releaseId: track.releaseId,
    });
  } catch (error) {
    console.error("Error fetching track:", error);
    return NextResponse.json(
      { error: "Failed to fetch track" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  try {
    const { trackId } = await params;
    const existing = await prisma.track.findUnique({ where: { id: trackId } });
    if (!existing) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
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
      isrcExplicit,
      spotifyLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      youtubeLink,
      soundcloudLink,
      primaryArtistIds,
      featureArtistIds,
      sortOrder,
    } = body;

    const featureNamesInBody = Object.prototype.hasOwnProperty.call(
      body,
      "featureArtistNames"
    );
    const featureArtistNamesPatch = featureNamesInBody
      ? normalizeFeatureArtistNamesInput(body.featureArtistNames)
      : undefined;

    if (primaryArtistIds !== undefined) {
      if (!Array.isArray(primaryArtistIds) || primaryArtistIds.length === 0) {
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
    }

    const featIds = featureArtistIds !== undefined ? featureArtistIds : undefined;
    if (featIds && featIds.length > 0) {
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

    const track = await prisma.track.update({
      where: { id: trackId },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(image !== undefined && { image: image ? String(image) : null }),
        ...(audioFile !== undefined && { audioFile: String(audioFile) }),
        ...(duration !== undefined && { duration: parseInt(String(duration), 10) }),
        ...(releaseDate !== undefined && {
          releaseDate: releaseDate ? new Date(releaseDate) : null,
        }),
        ...(composer !== undefined && { composer: composer ? String(composer) : null }),
        ...(lyricist !== undefined && { lyricist: lyricist ? String(lyricist) : null }),
        ...(leadVocal !== undefined && { leadVocal: leadVocal ? String(leadVocal) : null }),
        ...(lyrics !== undefined && { lyrics: lyrics ? String(lyrics) : null }),
        ...(stemsFile !== undefined && { stemsFile: stemsFile ? String(stemsFile) : null }),
        ...(trackCredits !== undefined && { trackCredits: trackCredits ?? null }),
        ...(isrcCode !== undefined && { isrcCode: isrcCode ? String(isrcCode) : null }),
        ...(isrcExplicit !== undefined && { isrcExplicit: Boolean(isrcExplicit) }),
        ...(spotifyLink !== undefined && { spotifyLink: spotifyLink || null }),
        ...(appleMusicLink !== undefined && { appleMusicLink: appleMusicLink || null }),
        ...(tidalLink !== undefined && { tidalLink: tidalLink || null }),
        ...(amazonMusicLink !== undefined && { amazonMusicLink: amazonMusicLink || null }),
        ...(youtubeLink !== undefined && { youtubeLink: youtubeLink || null }),
        ...(soundcloudLink !== undefined && { soundcloudLink: soundcloudLink || null }),
        ...(primaryArtistIds !== undefined && { primaryArtistIds }),
        ...(featIds !== undefined &&
          featureArtistNamesPatch === undefined && { featureArtistIds: featIds }),
        ...(featureArtistNamesPatch !== undefined && {
          featureArtistNames: featureArtistNamesPatch,
          featureArtistIds: [],
        }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      },
    });

    return NextResponse.json(serializeTrack(track));
  } catch (error) {
    console.error("Error updating track:", error);
    return NextResponse.json(
      { error: "Failed to update track" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  try {
    const { trackId } = await params;
    const existing = await prisma.track.findUnique({
      where: { id: trackId },
      include: { release: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    await prisma.track.delete({ where: { id: trackId } });
    return NextResponse.json({ message: "Track deleted successfully" });
  } catch (error) {
    console.error("Error deleting track:", error);
    return NextResponse.json(
      { error: "Failed to delete track" },
      { status: 500 }
    );
  }
}
