import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest, requirePermission } from "@/lib/auth-guard";
import { Prisma } from "@prisma/client";
import { serializeTrack, serializeTrackForPublic, normalizeFeatureArtistNamesInput } from "@/lib/release-format";
import { normalizeSplits, splitsProblem } from "@/lib/release-splits";
import { isReleasePublic } from "@/lib/catalog-data";
import { recordAudit } from "@/lib/audit";
import { sweepCatalogObjects } from "@/lib/s3-sweep";
import { revalidateAdminCatalog } from "@/lib/admin-cache-tags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const isAdmin = await isAdminRequest(request);
    // Don't expose tracks belonging to unreleased (DRAFT / future-scheduled)
    // releases to the public — that would leak unreleased audio by track id.
    if (!isAdmin && !isReleasePublic(track.release)) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
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
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

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
      syncedLyrics,
      stemsFile,
      trackCredits,
      splits,
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

    // Royalty splits, when sent from this explicit-save dialog, must be either
    // empty or an exact 100% allocation, and any linked artist must exist —
    // a partial total or dangling artistId stored here feeds royalty accounting
    // bad data with a "Saved" toast on top.
    let splitsPatch: ReturnType<typeof normalizeSplits> | undefined;
    if (splits !== undefined) {
      splitsPatch = normalizeSplits(splits);
      const problem = splitsProblem(splitsPatch);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      const linked = [...new Set(splitsPatch.map((s) => s.artistId).filter((x): x is string => !!x))];
      if (linked.length) {
        const found = await prisma.artist.count({ where: { id: { in: linked } } });
        if (found !== linked.length) {
          return NextResponse.json(
            { error: "A split references an artist that doesn't exist" },
            { status: 400 }
          );
        }
      }
    }

    const track = await prisma.track.update({
      where: { id: trackId },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(image !== undefined && { image: image ? String(image) : null }),
        ...(audioFile !== undefined && { audioFile: String(audioFile) }),
        ...(duration !== undefined &&
          Number.isFinite(parseInt(String(duration), 10)) && {
            duration: parseInt(String(duration), 10),
          }),
        ...(releaseDate !== undefined && {
          releaseDate: releaseDate ? new Date(releaseDate) : null,
        }),
        ...(composer !== undefined && { composer: composer ? String(composer) : null }),
        ...(lyricist !== undefined && { lyricist: lyricist ? String(lyricist) : null }),
        ...(leadVocal !== undefined && { leadVocal: leadVocal ? String(leadVocal) : null }),
        ...(lyrics !== undefined && { lyrics: lyrics ? String(lyrics) : null }),
        ...(syncedLyrics !== undefined && { syncedLyrics: syncedLyrics ? String(syncedLyrics) : null }),
        ...(stemsFile !== undefined && { stemsFile: stemsFile ? String(stemsFile) : null }),
        ...(trackCredits !== undefined && { trackCredits: trackCredits ?? null }),
        ...(splitsPatch !== undefined && { splits: splitsPatch as unknown as Prisma.InputJsonValue }),
        ...(isrcCode !== undefined && { isrcCode: isrcCode ? String(isrcCode) : null }),
        ...(iswc !== undefined && { iswc: iswc ? String(iswc).trim() : null }),
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

    revalidateAdminCatalog();
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
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  try {
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    const { trackId } = await params;
    const existing = await prisma.track.findUnique({
      where: { id: trackId },
      include: { release: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    await prisma.track.delete({ where: { id: trackId } });
    revalidateAdminCatalog();

    // Sweep the track's S3 objects now that nothing references them — deleting
    // the row used to leave audio/stems/art in the bucket, publicly readable
    // forever. Best-effort; shared files survive the sweep's reference re-check.
    await sweepCatalogObjects([existing.audioFile, existing.stemsFile, existing.image]);

    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "track",
      resourceId: trackId,
      summary: `Deleted track "${existing.name ?? trackId}"`,
    });

    return NextResponse.json({ message: "Track deleted successfully" });
  } catch (error) {
    console.error("Error deleting track:", error);
    return NextResponse.json(
      { error: "Failed to delete track" },
      { status: 500 }
    );
  }
}
