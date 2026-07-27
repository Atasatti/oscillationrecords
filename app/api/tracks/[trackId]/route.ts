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
import { withWriteRetry } from "@/lib/db-retry";
import {
  validateResultingTracklist,
  tracklistAfterDelete,
  TracklistError,
} from "@/lib/release-tracks";

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
    // Read the track's own fields once, for the post-commit S3 sweep + audit.
    // The last-track invariant is (re-)checked authoritatively inside the
    // transaction below against freshly-read rows.
    const existing = await prisma.track.findUnique({
      where: { id: trackId },
      select: { name: true, audioFile: true, stemsFile: true, image: true, releaseId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    // The last track may NOT be pulled out from under a live release — doing so
    // strands a published record with nothing to play (its public page/API 404s
    // or renders empty while the release still reads as live). This is the SAME
    // rule the tracklist editor's PATCH enforces (validateResultingTracklist);
    // applying it here closes the gap where this standalone delete (used by the
    // legacy release detail page) bypassed it. Drafts and future-dated
    // Coming-Soon releases are exempt.
    //
    // Concurrency: the check re-reads the tracklist INSIDE the transaction, and
    // the transaction also touches the release row. Two concurrent deletes of a
    // live release's final two tracks would otherwise each see the other track
    // still present in its own snapshot and both commit, emptying the release —
    // the shared write to the release document makes MongoDB raise a write
    // conflict, so withWriteRetry re-runs the loser, which then sees the shrunk
    // list and rejects. `gone` covers the track being deleted concurrently
    // between the read above and the transaction.
    const gone = await withWriteRetry(() =>
      prisma.$transaction(async (tx) => {
        const track = await tx.track.findUnique({
          where: { id: trackId },
          include: { release: { select: { status: true, releaseDate: true } } },
        });
        if (!track) return true;

        const stored = await tx.track.findMany({
          where: { releaseId: track.releaseId },
          select: { id: true, audioFile: true },
        });
        const problem = validateResultingTracklist({
          stored,
          resulting: tracklistAfterDelete(stored, trackId),
          nextStatus: track.release.status,
          nextIsLive: isReleasePublic(track.release),
        });
        if (problem) throw new TracklistError(problem);

        await tx.track.delete({ where: { id: trackId } });
        // Serialize concurrent last-track deletes on this release (see note).
        await tx.release.update({
          where: { id: track.releaseId },
          data: { updatedAt: new Date() },
        });
        return false;
      })
    );

    if (gone) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    revalidateAdminCatalog();

    // Sweep the track's S3 objects now that nothing references them — deleting
    // the row used to leave audio/stems/art in the bucket forever. Best-effort;
    // shared files survive the sweep's reference re-check. After the commit only,
    // so a rolled-back (rejected) delete never removes objects.
    await sweepCatalogObjects([existing.audioFile, existing.stemsFile, existing.image]);

    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "track",
      resourceId: trackId,
      summary: `Deleted track "${existing.name ?? trackId}"`,
    });

    return NextResponse.json({ message: "Track deleted successfully" });
  } catch (error) {
    // The last-track invariant failing is a client error (400), not a 500.
    if (error instanceof TracklistError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error deleting track:", error);
    return NextResponse.json(
      { error: "Failed to delete track" },
      { status: 500 }
    );
  }
}
