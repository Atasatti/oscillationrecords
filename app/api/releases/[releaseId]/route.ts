import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withWriteRetry } from "@/lib/db-retry";
import { isAdminRequest, requireAdmin } from "@/lib/auth-guard";
import { isReleasePublic } from "@/lib/catalog-data";
import { normalizeCredits } from "@/lib/credits";
import {
  normalizeFeatureArtistNamesInput,
  prismaKindToApi,
  serializeTrack,
  serializeTrackForPublic,
} from "@/lib/release-format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const { releaseId } = await params;

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      include: {
        tracks: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const isAdmin = await isAdminRequest(request);
    // DRAFT releases are admin-only; SCHEDULED is public (Coming-Soon page).
    if (!isAdmin && release.status === "DRAFT") {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    // A future-dated SCHEDULED (Coming-Soon) release is public for its metadata
    // (name, cover, date, pre-save), but its tracks' audio must NOT be served to
    // the public before release — that's a pre-release leak. The Coming-Soon page
    // renders "Tracklist to be revealed" when tracks is empty. Admins see all.
    const hideTracks = !isAdmin && !isReleasePublic(release);

    const allArtistIds = [
      ...release.primaryArtistIds,
      ...release.featureArtistIds,
    ];
    release.tracks.forEach((t) => {
      t.primaryArtistIds.forEach((id) => allArtistIds.push(id));
      t.featureArtistIds.forEach((id) => allArtistIds.push(id));
    });

    const artists = await prisma.artist.findMany({
      where: { id: { in: [...new Set(allArtistIds.map(String))] } },
      select: { id: true, name: true, profilePicture: true },
    });

    const tracks = hideTracks
      ? []
      : release.tracks.map((t) =>
          isAdmin ? serializeTrack(t) : serializeTrackForPublic(t)
        );

    return NextResponse.json({
      id: release.id,
      name: release.name,
      status: release.status,
      preSaveUrl: release.preSaveUrl,
      coverImage: release.coverImage,
      kind: release.kind,
      type: prismaKindToApi(release.kind),
      primaryArtistIds: release.primaryArtistIds,
      featureArtistIds: release.featureArtistIds,
      featureArtistNames: release.featureArtistNames ?? [],
      description: release.description,
      releaseDate: release.releaseDate,
      primaryGenre: release.primaryGenre,
      secondaryGenre: release.secondaryGenre,
      credits: release.credits ?? [],
      upcCode: isAdmin ? release.upcCode : null,
      catalogueNumber: isAdmin ? release.catalogueNumber : null,
      pLine: isAdmin ? release.pLine : null,
      cLine: isAdmin ? release.cLine : null,
      isrcExplicit: release.isrcExplicit,
      spotifyLink: release.spotifyLink,
      appleMusicLink: release.appleMusicLink,
      tidalLink: release.tidalLink,
      amazonMusicLink: release.amazonMusicLink,
      youtubeLink: release.youtubeLink,
      soundcloudLink: release.soundcloudLink,
      sortOrder: release.sortOrder,
      showLatestOnHome: release.showLatestOnHome,
      showOnHome: release.showOnHome,
      artists,
      tracks,
      songs: tracks,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching release:", error);
    return NextResponse.json(
      { error: "Failed to fetch release" },
      { status: 500 }
    );
  }
}

function parseTrackInput(
  t: Record<string, unknown>,
  index: number,
  isNew: boolean
): {
  id?: string;
  name: string;
  image: string | null;
  audioFile: string;
  duration: number;
  releaseDate: Date | null;
  composer: string | null;
  lyricist: string | null;
  leadVocal: string | null;
  lyrics: string | null;
  stemsFile: string | null;
  trackCredits: Prisma.InputJsonValue | null;
  isrcCode: string | null;
  iswc: string | null;
  isrcExplicit: boolean;
  spotifyLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  youtubeLink: string | null;
  soundcloudLink: string | null;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames: string[];
  sortOrder: number;
} {
  const id = t.id ? String(t.id) : undefined;
  const name = String(t.name || "").trim();
  const audioFile = String(t.audioFile || "").trim();
  const duration = parseInt(String(t.duration ?? 0), 10);
  if (!name) {
    throw new Error(`Track ${index + 1}: name is required`);
  }
  if (isNew && (!audioFile || !Number.isFinite(duration) || duration < 0)) {
    throw new Error(
      `Track ${index + 1}: audioFile and duration are required for new tracks`
    );
  }
  const primaryArtistIds = Array.isArray(t.primaryArtistIds)
    ? (t.primaryArtistIds as string[])
    : [];
  if (primaryArtistIds.length === 0) {
    throw new Error(`Track ${index + 1}: at least one primary artist is required`);
  }
  return {
    id,
    name,
    image: t.image !== undefined && t.image !== null ? String(t.image) : null,
    audioFile,
    duration: Number.isFinite(duration) ? duration : 0,
    releaseDate: t.releaseDate ? new Date(String(t.releaseDate)) : null,
    composer: t.composer ? String(t.composer) : null,
    lyricist: t.lyricist ? String(t.lyricist) : null,
    leadVocal: t.leadVocal ? String(t.leadVocal) : null,
    lyrics: t.lyrics ? String(t.lyrics) : null,
    stemsFile: t.stemsFile ? String(t.stemsFile) : null,
    trackCredits:
      t.trackCredits !== undefined && t.trackCredits !== null
        ? (t.trackCredits as Prisma.InputJsonValue)
        : null,
    isrcCode: t.isrcCode ? String(t.isrcCode) : null,
    iswc: t.iswc ? String(t.iswc).trim() : null,
    isrcExplicit: Boolean(t.isrcExplicit),
    spotifyLink: t.spotifyLink ? String(t.spotifyLink) : null,
    appleMusicLink: t.appleMusicLink ? String(t.appleMusicLink) : null,
    tidalLink: t.tidalLink ? String(t.tidalLink) : null,
    amazonMusicLink: t.amazonMusicLink ? String(t.amazonMusicLink) : null,
    youtubeLink: t.youtubeLink ? String(t.youtubeLink) : null,
    soundcloudLink: t.soundcloudLink ? String(t.soundcloudLink) : null,
    primaryArtistIds,
    featureArtistIds: Array.isArray(t.featureArtistIds)
      ? (t.featureArtistIds as string[])
      : [],
    featureArtistNames: normalizeFeatureArtistNamesInput(t.featureArtistNames),
    sortOrder: typeof t.sortOrder === "number" ? t.sortOrder : index,
  };
}

// PATCH /api/releases/[releaseId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { releaseId } = await params;
    const existing = await prisma.release.findUnique({
      where: { id: releaseId },
      include: { tracks: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      coverImage,
      releaseDate,
      description,
      primaryGenre,
      secondaryGenre,
      upcCode,
      catalogueNumber,
      pLine,
      cLine,
      status,
      preSaveUrl,
      isrcExplicit,
      credits,
      spotifyLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      youtubeLink,
      soundcloudLink,
      sortOrder,
      showLatestOnHome,
      showOnHome,
      primaryArtistIds,
      featureArtistIds,
      featureArtistNames: releaseFeatureNamesRaw,
      tracks: tracksRaw,
    } = body;

    // No past-dated Coming Soon: enforce a future date when the admin is actively
    // scheduling this release, or changing the date of an already-scheduled one.
    // (Unrelated PATCHes — e.g. toggling "New Music" — aren't blocked.)
    const settingScheduled = status === "SCHEDULED";
    // Changing the date of an already-scheduled release keeps the future-date rule
    // — UNLESS this save moves it to DRAFT or RELEASED (it's no longer "Coming
    // Soon", so a past/empty date is fine, e.g. publishing or parking as a draft).
    const changingDateWhileScheduled =
      existing.status === "SCHEDULED" &&
      releaseDate !== undefined &&
      status !== "DRAFT" &&
      status !== "RELEASED";
    if (settingScheduled || changingDateWhileScheduled) {
      const effective = releaseDate !== undefined ? releaseDate : existing.releaseDate;
      const d = effective ? new Date(effective) : null;
      if (!d || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "Scheduled releases must use a future release date" },
          { status: 400 }
        );
      }
    }

    // Publishing (RELEASED) or scheduling (SCHEDULED) requires complete details —
    // a cover and at least one primary artist. DRAFT skips this so incomplete work
    // can be saved. Falls back to the stored values for fields this patch omits,
    // so a status-only publish still validates what's already saved.
    const publishing = status === "RELEASED" || status === "SCHEDULED";
    if (publishing) {
      const effectiveCover = coverImage !== undefined ? coverImage : existing.coverImage;
      if (!effectiveCover) {
        return NextResponse.json(
          { error: "A cover image is required to publish or schedule a release" },
          { status: 400 }
        );
      }
      const effectivePrimary =
        primaryArtistIds !== undefined ? primaryArtistIds : existing.primaryArtistIds;
      if (!Array.isArray(effectivePrimary) || effectivePrimary.length === 0) {
        return NextResponse.json(
          { error: "At least one primary artist is required to publish or schedule a release" },
          { status: 400 }
        );
      }
    }

    // The New Music carousel and the "Latest" pill are public surfaces. New Music
    // requires a published (non-DRAFT) release; "Latest Release" is stricter — only
    // a live release (RELEASED, or SCHEDULED whose date has arrived) qualifies.
    // Reject an explicit attempt to NEWLY feature an ineligible release; a full
    // editor save that merely carries a stale flag is coerced off below instead
    // (self-healing), so it never blocks an unrelated save.
    const nextStatus = ["DRAFT", "SCHEDULED", "RELEASED"].includes(String(status))
      ? (status as "DRAFT" | "SCHEDULED" | "RELEASED")
      : existing.status;
    const nextReleaseDate =
      releaseDate !== undefined
        ? releaseDate
          ? new Date(releaseDate)
          : null
        : existing.releaseDate;
    const nextIsLive = isReleasePublic({ status: nextStatus, releaseDate: nextReleaseDate });

    if (showOnHome === true && !existing.showOnHome && nextStatus === "DRAFT") {
      return NextResponse.json(
        {
          error:
            "Only published releases can be added to the New Music carousel — publish this release first.",
        },
        { status: 400 }
      );
    }
    if (showLatestOnHome === true && !existing.showLatestOnHome && !nextIsLive) {
      return NextResponse.json(
        { error: "Only released / live releases can be set as a Latest Release." },
        { status: 400 }
      );
    }
    // A DRAFT can't sit in New Music; a non-live release can't be a Latest Release.
    const clearShowOnHome = nextStatus === "DRAFT";
    const clearLatest = !nextIsLive;

    const releaseFeatureNamesPatch =
      releaseFeatureNamesRaw !== undefined
        ? normalizeFeatureArtistNamesInput(releaseFeatureNamesRaw)
        : undefined;

    // When newly featuring for the New Music carousel, append to the end of the
    // home order so it doesn't collide with existing featured releases.
    let homeOrderPatch: number | undefined;
    if (showOnHome === true && !existing.showOnHome) {
      const max = await prisma.release.aggregate({
        where: { showOnHome: true },
        _max: { homeOrder: true },
      });
      homeOrderPatch = (max._max.homeOrder ?? -1) + 1;
    }

    if (primaryArtistIds !== undefined) {
      if (!Array.isArray(primaryArtistIds)) {
        return NextResponse.json(
          { error: "primaryArtistIds must be an array" },
          { status: 400 }
        );
      }
      // Empty is allowed for a DRAFT (incomplete work); the publish gate above
      // enforces "at least one" for RELEASED/SCHEDULED. Validate any ids present.
      if (primaryArtistIds.length > 0) {
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
    }

    const featIds =
      featureArtistIds !== undefined ? featureArtistIds : undefined;
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

    let parsedTracks: ReturnType<typeof parseTrackInput>[] | undefined;
    let clearAllTracks = false;
    if (tracksRaw !== undefined) {
      if (!Array.isArray(tracksRaw)) {
        return NextResponse.json(
          { error: "tracks must be an array when provided" },
          { status: 400 }
        );
      }
      if (tracksRaw.length === 0) {
        clearAllTracks = true;
      } else {
        try {
          parsedTracks = tracksRaw.map((t: Record<string, unknown>, i: number) =>
            parseTrackInput(t, i, !t.id)
          );
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Invalid tracks" },
            { status: 400 }
          );
        }

        const allTrackArtistIds = new Set<string>();
        parsedTracks.forEach((t) => {
          t.primaryArtistIds.forEach((id) => allTrackArtistIds.add(id));
          t.featureArtistIds.forEach((id) => allTrackArtistIds.add(id));
        });
        const trackArtists = await prisma.artist.findMany({
          where: { id: { in: Array.from(allTrackArtistIds) } },
        });
        if (trackArtists.length !== allTrackArtistIds.size) {
          return NextResponse.json(
            { error: "One or more track artists not found" },
            { status: 404 }
          );
        }
      }
    }

    await withWriteRetry(() => prisma.$transaction(async (tx) => {
      // "Latest Release" supports MULTIPLE releases — no single-select clearing.
      await tx.release.update({
        where: { id: releaseId },
        data: {
          ...(name !== undefined && { name: String(name) }),
          ...(coverImage !== undefined && { coverImage: String(coverImage) }),
          ...(releaseDate !== undefined && {
            releaseDate: releaseDate ? new Date(releaseDate) : null,
          }),
          ...(description !== undefined && {
            description: description ? String(description) : null,
          }),
          ...(primaryGenre !== undefined && {
            primaryGenre: primaryGenre ? String(primaryGenre) : null,
          }),
          ...(secondaryGenre !== undefined && {
            secondaryGenre: secondaryGenre ? String(secondaryGenre) : null,
          }),
          ...(credits !== undefined && { credits: normalizeCredits(credits) }),
          ...(upcCode !== undefined && {
            upcCode: upcCode ? String(upcCode) : null,
          }),
          ...(catalogueNumber !== undefined && {
            catalogueNumber: catalogueNumber ? String(catalogueNumber).trim() : null,
          }),
          ...(pLine !== undefined && { pLine: pLine ? String(pLine).trim() : null }),
          ...(cLine !== undefined && { cLine: cLine ? String(cLine).trim() : null }),
          ...(["DRAFT", "SCHEDULED", "RELEASED"].includes(String(status)) && {
            status: status as "DRAFT" | "SCHEDULED" | "RELEASED",
          }),
          ...(preSaveUrl !== undefined && {
            preSaveUrl: preSaveUrl ? String(preSaveUrl).trim() : null,
          }),
          ...(isrcExplicit !== undefined && {
            isrcExplicit: Boolean(isrcExplicit),
          }),
          ...(spotifyLink !== undefined && { spotifyLink: spotifyLink || null }),
          ...(appleMusicLink !== undefined && {
            appleMusicLink: appleMusicLink || null,
          }),
          ...(tidalLink !== undefined && { tidalLink: tidalLink || null }),
          ...(amazonMusicLink !== undefined && {
            amazonMusicLink: amazonMusicLink || null,
          }),
          ...(youtubeLink !== undefined && { youtubeLink: youtubeLink || null }),
          ...(soundcloudLink !== undefined && {
            soundcloudLink: soundcloudLink || null,
          }),
          ...(sortOrder !== undefined && {
            sortOrder:
              typeof sortOrder === "number" && Number.isFinite(sortOrder)
                ? Math.trunc(sortOrder)
                : 0,
          }),
          // New Music is forced off for a DRAFT; "Latest" is forced off whenever the
          // release isn't live — otherwise honour the patch.
          ...(clearLatest
            ? { showLatestOnHome: false }
            : showLatestOnHome !== undefined && {
                showLatestOnHome: Boolean(showLatestOnHome),
              }),
          ...(clearShowOnHome
            ? { showOnHome: false }
            : showOnHome !== undefined && { showOnHome: Boolean(showOnHome) }),
          ...(homeOrderPatch !== undefined && { homeOrder: homeOrderPatch }),
          ...(primaryArtistIds !== undefined && { primaryArtistIds }),
          ...(featIds !== undefined && { featureArtistIds: featIds }),
          ...(releaseFeatureNamesPatch !== undefined && {
            featureArtistNames: releaseFeatureNamesPatch,
            featureArtistIds: [],
          }),
        },
      });

      if (clearAllTracks) {
        await tx.track.deleteMany({ where: { releaseId } });
      } else if (parsedTracks) {
        const existingIds = new Set(existing.tracks.map((t) => String(t.id)));
        const keepIds = new Set(
          parsedTracks.filter((t) => t.id).map((t) => String(t.id))
        );
        const toRemove = [...existingIds].filter((id) => !keepIds.has(id));
        if (toRemove.length) {
          await tx.track.deleteMany({
            where: { id: { in: toRemove }, releaseId },
          });
        }

      }
    }, {
      // The default 5s interactive-transaction timeout was occasionally blown by
      // remote-DB latency (P2028 "5239ms passed"). The body is small (one update
      // + a deleteMany), so give it real headroom; withWriteRetry re-runs if it
      // still times out or hits a write conflict.
      timeout: 20_000,
      maxWait: 10_000,
    }));

    // Track create/updates run OUTSIDE the interactive transaction, in small
    // concurrent batches. Many sequential track writes inside one transaction
    // blew Prisma's 5s interactive-transaction timeout (P2028) on larger albums.
    // Each write is its own retryable op on a distinct row, so they don't
    // conflict with one another or hold a transaction open.
    if (parsedTracks && !clearAllTracks) {
      const existingById = new Map(existing.tracks.map((t) => [String(t.id), t]));
      const writes = parsedTracks.map((t) => () => {
        const prev = t.id ? existingById.get(String(t.id)) : undefined;
        if (t.id && prev) {
          const nextAudio = t.audioFile || prev.audioFile;
          const nextDuration = t.audioFile ? t.duration : prev.duration;
          return withWriteRetry(() =>
            prisma.track.update({
              where: { id: t.id },
              data: {
                name: t.name,
                image: t.image,
                audioFile: nextAudio,
                duration: nextDuration,
                releaseDate: t.releaseDate,
                composer: t.composer,
                lyricist: t.lyricist,
                leadVocal: t.leadVocal,
                lyrics: t.lyrics,
                stemsFile: t.stemsFile,
                trackCredits: t.trackCredits,
                isrcCode: t.isrcCode,
                iswc: t.iswc,
                isrcExplicit: t.isrcExplicit,
                spotifyLink: t.spotifyLink,
                appleMusicLink: t.appleMusicLink,
                tidalLink: t.tidalLink,
                amazonMusicLink: t.amazonMusicLink,
                youtubeLink: t.youtubeLink,
                soundcloudLink: t.soundcloudLink,
                primaryArtistIds: t.primaryArtistIds,
                featureArtistIds: t.featureArtistIds,
                featureArtistNames: t.featureArtistNames,
                sortOrder: t.sortOrder,
              },
            })
          );
        }
        return withWriteRetry(() =>
          prisma.track.create({
            data: {
              releaseId,
              name: t.name,
              image: t.image,
              audioFile: t.audioFile,
              duration: t.duration,
              releaseDate: t.releaseDate,
              composer: t.composer,
              lyricist: t.lyricist,
              leadVocal: t.leadVocal,
              lyrics: t.lyrics,
              stemsFile: t.stemsFile,
              trackCredits: t.trackCredits,
              isrcCode: t.isrcCode,
              iswc: t.iswc,
              isrcExplicit: t.isrcExplicit,
              spotifyLink: t.spotifyLink,
              appleMusicLink: t.appleMusicLink,
              tidalLink: t.tidalLink,
              amazonMusicLink: t.amazonMusicLink,
              youtubeLink: t.youtubeLink,
              soundcloudLink: t.soundcloudLink,
              primaryArtistIds: t.primaryArtistIds,
              featureArtistIds: t.featureArtistIds,
              featureArtistNames: t.featureArtistNames,
              sortOrder: t.sortOrder,
            },
          })
        );
      });
      // Bounded concurrency: fast, but won't exhaust the DB connection pool.
      for (let i = 0; i < writes.length; i += 5) {
        await Promise.all(writes.slice(i, i + 5).map((run) => run()));
      }
    }

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      include: { tracks: { orderBy: { sortOrder: "asc" } } },
    });

    const allArtistIds = [
      ...(release?.primaryArtistIds || []),
      ...(release?.featureArtistIds || []),
    ];
    release?.tracks.forEach((t) => {
      t.primaryArtistIds.forEach((id) => allArtistIds.push(id));
      t.featureArtistIds.forEach((id) => allArtistIds.push(id));
    });

    const artists = await prisma.artist.findMany({
      where: { id: { in: [...new Set(allArtistIds.map(String))] } },
      select: { id: true, name: true, profilePicture: true },
    });

    const tracks = release?.tracks.map(serializeTrack) || [];

    return NextResponse.json({
      ...release,
      type: release ? prismaKindToApi(release.kind) : undefined,
      songs: tracks,
      tracks,
      artists,
    });
  } catch (error) {
    console.error("Error updating release:", error);
    return NextResponse.json({ error: "Failed to update release" }, { status: 500 });
  }
}

// DELETE /api/releases/[releaseId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { releaseId } = await params;
    const existing = await prisma.release.findUnique({ where: { id: releaseId } });
    if (!existing) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    await prisma.release.delete({ where: { id: releaseId } });
    return NextResponse.json({ message: "Release deleted successfully" });
  } catch (error) {
    console.error("Error deleting release:", error);
    return NextResponse.json(
      { error: "Failed to delete release" },
      { status: 500 }
    );
  }
}
