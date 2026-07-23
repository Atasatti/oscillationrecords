import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/object-id";
import { withWriteRetry } from "@/lib/db-retry";
import { isAdminRequest, requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isReleasePublic } from "@/lib/catalog-data";
import { isUsableFileUrl } from "@/lib/asset";
import { sweepCatalogObjects } from "@/lib/s3-sweep";
import { submitToIndexNow } from "@/lib/indexnow";
import { slugify } from "@/lib/slug";
import { normalizeCredits } from "@/lib/credits";
import { normalizeSplits } from "@/lib/release-splits";
import { revalidateAdminCatalog } from "@/lib/admin-cache-tags";
import {
  resultingTracklist,
  TracklistError,
  validateResultingTracklist,
} from "@/lib/release-tracks";
import {
  normalizeFeatureArtistNamesInput,
  prismaKindToApi,
  serializeTrack,
  serializeTrackForPublic,
  truncateReleaseDescription,
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
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

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

// A 24-hex Mongo ObjectId — used to decide whether a client-supplied track id can
// be trusted as an upsert key (#8).
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function parseTrackInput(
  t: Record<string, unknown>,
  index: number,
  isNew: boolean,
  enforcePublish: boolean
): {
  id?: string;
  name: string;
  image: string | null;
  audioFile: string | null;
  duration: number;
  releaseDate: Date | null;
  composer: string | null;
  lyricist: string | null;
  leadVocal: string | null;
  lyrics: string | null;
  syncedLyrics: string | null;
  stemsFile: string | null;
  trackCredits: Prisma.InputJsonValue | null;
  splits: ReturnType<typeof normalizeSplits>;
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
  // Audio and a primary artist are required only when PUBLISHING the release
  // (RELEASED). A draft (or Coming-Soon) track can be saved with just a name and
  // completed before it goes live.
  if (enforcePublish && isNew && !audioFile) {
    throw new Error(`Track ${index + 1}: audio is required to publish`);
  }
  const primaryArtistIds = Array.isArray(t.primaryArtistIds)
    ? (t.primaryArtistIds as string[])
    : [];
  if (enforcePublish && primaryArtistIds.length === 0) {
    throw new Error(`Track ${index + 1}: at least one primary artist is required to publish`);
  }
  return {
    id,
    name,
    image: t.image !== undefined && t.image !== null ? String(t.image) : null,
    audioFile: audioFile || null,
    duration: audioFile && Number.isFinite(duration) ? duration : 0,
    releaseDate: t.releaseDate ? new Date(String(t.releaseDate)) : null,
    composer: t.composer ? String(t.composer) : null,
    lyricist: t.lyricist ? String(t.lyricist) : null,
    leadVocal: t.leadVocal ? String(t.leadVocal) : null,
    lyrics: t.lyrics ? String(t.lyrics) : null,
    syncedLyrics: t.syncedLyrics ? String(t.syncedLyrics) : null,
    stemsFile: t.stemsFile ? String(t.stemsFile) : null,
    trackCredits:
      t.trackCredits !== undefined && t.trackCredits !== null
        ? (t.trackCredits as Prisma.InputJsonValue)
        : null,
    // The editor SENDS splits with every save, but this parser used to drop
    // them — the save 200'd, the toast said saved, and the split was gone on
    // reload. Normalized here, persisted in the update/create below.
    splits: normalizeSplits(t.splits),
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
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
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
      // isUsableFileUrl, not a truthiness check: rows written before the fix
      // above hold the literal string "null", which is truthy and would let a
      // coverless release publish.
      if (!isUsableFileUrl(effectiveCover)) {
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
        // Per-track audio/artist are enforced only when the release is going fully
        // live (RELEASED); drafts and Coming-Soon save freely.
        const enforceTrackPublishRules = nextStatus === "RELEASED";
        // A track is NEW when its id isn't already stored on this release. Clients
        // now send a stable client-generated id for new tracks too (#8), so "new"
        // can't be inferred from id-absence alone — check DB membership.
        const existingTrackIdSet = new Set(existing.tracks.map((t) => String(t.id)));
        const isNewTrack = (t: Record<string, unknown>) =>
          !t.id || !existingTrackIdSet.has(String(t.id));
        try {
          parsedTracks = tracksRaw.map((t: Record<string, unknown>, i: number) =>
            parseTrackInput(t, i, isNewTrack(t), enforceTrackPublishRules)
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
          // Royalty-split rows linked to a roster artist must reference a real
          // one — same check, same failure, as the track's own artists.
          t.splits.forEach((sp) => { if (sp.artistId) allTrackArtistIds.add(sp.artistId); });
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

    // What the tracklist will look like AFTER this write. `submittedTracks` is
    // undefined when the request omits `tracks` (list untouched) and [] when it
    // asks to clear them — the empty case is why this has to be computed rather
    // than read off `existing`: validating the stored list let `{ tracks: [] }`
    // pass on the very tracks it was about to delete.
    const submittedTracks = clearAllTracks ? [] : parsedTracks;

    // Fail fast on the state we've already read, so an obviously bad edit 400s
    // without opening a transaction. The authoritative check re-runs inside the
    // transaction against freshly-read tracks (below).
    const tracklistProblem = validateResultingTracklist({
      stored: existing.tracks,
      resulting: resultingTracklist(existing.tracks, submittedTracks),
      nextStatus,
      nextIsLive,
    });
    if (tracklistProblem) {
      return NextResponse.json({ error: tracklistProblem }, { status: 400 });
    }

    // Files this edit stops referencing (removed tracks' audio/stems/art, and
    // the OLD file wherever one was replaced). Collected inside the transaction
    // — reset on every attempt so a retry can't double-collect — and swept only
    // AFTER the commit; a rolled-back edit must never delete objects.
    const sweepUrls: Array<string | null> = [];

    // ONE transaction for the whole edit: the release row, track deletions, track
    // updates and track creations. These used to be split — the release update and
    // deletions inside a transaction, creates/updates after it — which meant a
    // failure partway through the track writes left the release updated and its
    // old tracks already deleted, with only some of the replacements written. It
    // also made retrying unsafe, since a re-run could duplicate tracks that had
    // already been created. Now nothing commits unless everything does, and
    // withWriteRetry can re-run the whole thing from a clean slate.
    await withWriteRetry(() => prisma.$transaction(async (tx) => {
      sweepUrls.length = 0;
      // Re-read the tracklist inside the transaction: `existing` was read before
      // this request did any other awaits, so a concurrent editor save could have
      // changed it. Validating (and diffing) against the rows we're actually
      // mutating is what makes a retry correct rather than merely repeated.
      const current = await tx.track.findMany({
        where: { releaseId },
        select: { id: true, audioFile: true, stemsFile: true, image: true, duration: true },
      });
      const problem = validateResultingTracklist({
        stored: current,
        resulting: resultingTracklist(current, submittedTracks),
        nextStatus,
        nextIsLive,
      });
      if (problem) throw new TracklistError(problem);

      // "Latest Release" supports MULTIPLE releases — no single-select clearing.
      await tx.release.update({
        where: { id: releaseId },
        data: {
          ...(name !== undefined && { name: String(name) }),
          // Removing the cover sends coverImage: null, and String(null) is the
          // literal "null" — which then renders as <img src="null">, a RELATIVE
          // URL the browser resolves against the current page (hence the
          // /admin/releases/<id>/null and /admin/null 404s). coverImage is a
          // required column, so "" is the empty value, exactly as POST /releases
          // already stores it.
          ...(coverImage !== undefined && {
            coverImage: coverImage ? String(coverImage) : "",
          }),
          ...(releaseDate !== undefined && {
            releaseDate: releaseDate ? new Date(releaseDate) : null,
          }),
          ...(description !== undefined && {
            description: truncateReleaseDescription(description),
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
        for (const t of current) sweepUrls.push(t.audioFile, t.stemsFile, t.image);
        await tx.track.deleteMany({ where: { releaseId } });
      } else if (parsedTracks) {
        const existingIds = new Set(current.map((t) => String(t.id)));
        const keepIds = new Set(
          parsedTracks.filter((t) => t.id).map((t) => String(t.id))
        );
        const toRemove = [...existingIds].filter((id) => !keepIds.has(id));
        if (toRemove.length) {
          const removeSet = new Set(toRemove);
          for (const t of current) {
            if (removeSet.has(String(t.id))) sweepUrls.push(t.audioFile, t.stemsFile, t.image);
          }
          await tx.track.deleteMany({
            where: { id: { in: toRemove }, releaseId },
          });
        }
      }

      if (!parsedTracks || clearAllTracks) return;

      // Track writes run sequentially on the transaction's connection (Prisma
      // interactive transactions don't support concurrent operations on one tx
      // client). That's slower than the old batched-concurrent version, but a
      // 30-track album is ~30 round trips — comfortably inside the timeout below.
      const existingById = new Map(current.map((t) => [String(t.id), t]));
      for (const t of parsedTracks) {
        const prev = t.id ? existingById.get(String(t.id)) : undefined;
        if (t.id && prev) {
          // An omitted/blank audioFile KEEPS the stored file — an edit that
          // doesn't re-send the audio must never blank a released track.
          const nextAudio = t.audioFile || prev.audioFile;
          const nextDuration = t.audioFile ? t.duration : prev.duration;
          // Replacements strand the OLD object — queue it for the post-commit
          // sweep (audio only counts when a new file was actually sent; stems
          // and art are direct overwrites, so any change strands the old one).
          if (prev.audioFile && t.audioFile && t.audioFile !== prev.audioFile) sweepUrls.push(prev.audioFile);
          if (prev.stemsFile && prev.stemsFile !== t.stemsFile) sweepUrls.push(prev.stemsFile);
          if (prev.image && prev.image !== t.image) sweepUrls.push(prev.image);
          await tx.track.update({
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
              syncedLyrics: t.syncedLyrics,
              stemsFile: t.stemsFile,
              trackCredits: t.trackCredits,
              splits: t.splits as unknown as Prisma.InputJsonValue,
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
          });
          continue;
        }
        // NEW track. Build the create row once.
        const data: Prisma.TrackUncheckedCreateInput = {
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
          syncedLyrics: t.syncedLyrics,
          stemsFile: t.stemsFile,
          trackCredits: t.trackCredits,
          splits: t.splits as unknown as Prisma.InputJsonValue,
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
        };
        const clientId = t.id;
        if (clientId && OBJECT_ID.test(clientId)) {
          // Idempotent create for a NEW track carrying a client-generated stable id
          // (#8) — but SCOPED to this release. A bare upsert({ where:{ id } }) would
          // let a caller pass ANOTHER release's track id (track ids are exposed by
          // the public API) and hijack it, moving its releaseId (IDOR). So:
          //   1. update-if-it's-ours (retry-safe): updateMany pinned to { id, releaseId },
          //      never touching releaseId;
          //   2. else, refuse an id that already belongs to a different release;
          //   3. else create it under THIS release.
          const updateData: Prisma.TrackUncheckedUpdateManyInput = {
            name: data.name, image: data.image, audioFile: data.audioFile, duration: data.duration,
            releaseDate: data.releaseDate, composer: data.composer, lyricist: data.lyricist,
            leadVocal: data.leadVocal, lyrics: data.lyrics, syncedLyrics: data.syncedLyrics,
            stemsFile: data.stemsFile, trackCredits: t.trackCredits,
            splits: t.splits as unknown as Prisma.InputJsonValue,
            isrcCode: data.isrcCode, iswc: data.iswc, isrcExplicit: data.isrcExplicit,
            spotifyLink: data.spotifyLink, appleMusicLink: data.appleMusicLink, tidalLink: data.tidalLink,
            amazonMusicLink: data.amazonMusicLink, youtubeLink: data.youtubeLink, soundcloudLink: data.soundcloudLink,
            primaryArtistIds: data.primaryArtistIds, featureArtistIds: data.featureArtistIds,
            featureArtistNames: data.featureArtistNames, sortOrder: data.sortOrder,
          };
          const res = await tx.track.updateMany({ where: { id: clientId, releaseId }, data: updateData });
          if (res.count === 0) {
            const clash = await tx.track.findUnique({ where: { id: clientId }, select: { releaseId: true } });
            if (clash) throw new Error(`Track id ${clientId} belongs to another release`);
            await tx.track.create({ data: { ...data, id: clientId } });
          }
          continue;
        }
        await tx.track.create({ data });
      }
    }, {
      // Headroom for a long album: the body is one release update, a deleteMany
      // and one round trip per track, run sequentially at remote-DB latency. Well
      // under MongoDB's 60s transactionLifetimeLimitSeconds; withWriteRetry
      // re-runs the whole transaction on a timeout or write conflict, which is
      // safe precisely because a failed transaction commits nothing.
      timeout: 30_000,
      maxWait: 15_000,
    }));

    // Post-commit, best-effort: delete the objects this edit stopped
    // referencing (never throws; shared files survive its reference re-check).
    await sweepCatalogObjects(sweepUrls);

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

    revalidateAdminCatalog();

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Updated release "${release?.name ?? existing.name}"`,
    });

    // If this update leaves the release publicly live (RELEASED/past-scheduled AND
    // has a tracklist), ping IndexNow so Bing/etc recrawl the page + the listings
    // it now appears on. Runs after the response — never blocks the publish.
    if (nextIsLive && tracks.length > 0) {
      const slug = slugify(release?.name ?? existing.name);
      after(() => submitToIndexNow([`/releases/${slug}`, "/releases", "/"]));
    }

    return NextResponse.json({
      ...release,
      type: release ? prismaKindToApi(release.kind) : undefined,
      songs: tracks,
      tracks,
      artists,
    });
  } catch (error) {
    // The tracklist rules re-run inside the transaction against freshly-read
    // rows, so losing a race to a concurrent editor surfaces here. It's a
    // rejected edit, not a server fault — and nothing was written.
    if (error instanceof TracklistError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    // Include the tracks so their S3 objects can be swept after the cascade
    // removes the rows — the delete used to leave every audio/stems/image file
    // (and the cover) in the bucket forever, publicly downloadable.
    const existing = await prisma.release.findUnique({
      where: { id: releaseId },
      include: { tracks: { select: { audioFile: true, stemsFile: true, image: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    await prisma.release.delete({ where: { id: releaseId } });
    revalidateAdminCatalog();
    // Best-effort, after the delete commits; never throws. Files still
    // referenced elsewhere (a shared cover, a duplicated test release) survive.
    await sweepCatalogObjects([
      existing.coverImage,
      ...existing.tracks.flatMap((t) => [t.audioFile, t.stemsFile, t.image]),
    ]);
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "release",
      resourceId: releaseId,
      summary: `Deleted release "${existing.name}"`,
    });
    return NextResponse.json({ message: "Release deleted successfully" });
  } catch (error) {
    console.error("Error deleting release:", error);
    return NextResponse.json(
      { error: "Failed to delete release" },
      { status: 500 }
    );
  }
}
