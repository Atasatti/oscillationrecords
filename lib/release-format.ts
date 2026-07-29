import type { Artist, Release, Track } from "@prisma/client";
import { trackAudioHref } from "@/lib/s3-url";

export type ApiReleaseKind = "single" | "ep" | "album";

/**
 * Hard cap on a release description. Kept short enough to make a clean meta
 * description / OpenGraph body and to stop long copy blowing out the "About"
 * panel on the release page. Enforced end-to-end: the admin form shows a live
 * counter + validation, the API truncates on save, and the public page truncates
 * defensively at render time — all via {@link truncateReleaseDescription}.
 */
export const RELEASE_DESCRIPTION_MAX = 600;

/** Trim and hard-cap a description to {@link RELEASE_DESCRIPTION_MAX}; null when empty. */
export function truncateReleaseDescription(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > RELEASE_DESCRIPTION_MAX ? text.slice(0, RELEASE_DESCRIPTION_MAX) : text;
}

/**
 * mm:ss from seconds; "—" when zero/unknown. Single source of truth for track
 * duration display — the public release page and the admin editor both use this,
 * so an unknown duration renders identically ("—") in both.
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function prismaKindToApi(kind: Release["kind"]): ApiReleaseKind {
  switch (kind) {
    case "SINGLE":
      return "single";
    case "EP":
      return "ep";
    case "ALBUM":
      return "album";
    default:
      return "single";
  }
}

export function apiKindToPrisma(
  kind: string | undefined
): "SINGLE" | "EP" | "ALBUM" | null {
  const k = String(kind || "").toUpperCase();
  if (k === "SINGLE" || k === "EP" || k === "ALBUM") return k as "SINGLE" | "EP" | "ALBUM";
  const lower = String(kind || "").toLowerCase();
  if (lower === "single") return "SINGLE";
  if (lower === "ep") return "EP";
  if (lower === "album") return "ALBUM";
  return null;
}

export function featureIdsExcludingPrimary(
  featureIds: string[],
  primaryIds: string[]
) {
  const primarySet = new Set(primaryIds.map(String));
  return featureIds.filter((id) => !primarySet.has(String(id)));
}

/** Normalize manual feature credits from API or form (string or string[]). */
export function normalizeFeatureArtistNamesInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
      )
    );
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
  }
  return [];
}

/**
 * Prefer stored manual names; otherwise resolve from linked artist IDs.
 */
export function combinedFeatureDisplayNames(
  featureArtistIds: string[],
  primaryArtistIds: string[],
  artistMap: Map<string, Pick<Artist, "id" | "name">>,
  manualNames: string[] | null | undefined
): string[] {
  const manual = normalizeFeatureArtistNamesInput(manualNames);
  if (manual.length > 0) return manual;
  const fromIds = featureIdsExcludingPrimary(featureArtistIds || [], primaryArtistIds)
    .map((id) => artistMap.get(String(id))?.name)
    .filter((n): n is string => Boolean(n));
  return Array.from(new Set(fromIds));
}

export function buildArtistMap(artists: Pick<Artist, "id" | "name">[]) {
  return new Map(artists.map((a) => [String(a.id), a]));
}

export function primaryNamesFromIds(
  ids: string[],
  artistMap: Map<string, Pick<Artist, "id" | "name">>
) {
  const names = ids
    .map((id) => artistMap.get(String(id))?.name)
    .filter((n): n is string => Boolean(n));
  return names.length ? names.join(", ") : "Unknown Artist";
}

export function formatArtistLine(primaryName: string, featureNames: string[]) {
  const unique = Array.from(new Set(featureNames.filter(Boolean)));
  return unique.length > 0 ? `${primaryName} ft ${unique.join(", ")}` : primaryName;
}

export function getOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function serializeTrack(t: Track) {
  return {
    id: t.id,
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
    splits: t.splits,
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
    featureArtistNames: t.featureArtistNames ?? [],
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/**
 * Public payloads: omit ISRC, ISWC, the master `stemsFile` URL, the royalty
 * `splits`, and the LRC `syncedLyrics` — stems are sensitive label IP, splits hold
 * internal real names/emails, and synced timing is internal (no public karaoke
 * display yet); none must ship to anonymous clients. Plain `lyrics` ARE shipped:
 * owned, indexable content (the release page + JSON-LD surface them). The admin
 * session still uses the full {@link serializeTrack}.
 *
 * `audioFile` is rewritten to the gated playback route: raw tracks/audio/ bucket
 * URLs stopped being anonymously readable in the 2026-07-24 lockdown, so a
 * public payload carrying one would hand players a dead (403) link. The admin
 * serializer keeps the raw URL — the release editor round-trips `audioFile`
 * verbatim on autosave, so the DB value must stay canonical.
 */
export function serializeTrackForPublic(
  t: Track
): Omit<
  ReturnType<typeof serializeTrack>,
  "isrcCode" | "iswc" | "stemsFile" | "splits" | "syncedLyrics"
> {
  const {
    isrcCode: _isrc,
    iswc: _iswc,
    stemsFile: _stems,
    splits: _splits,
    syncedLyrics: _synced,
    ...rest
  } = serializeTrack(t);
  void _isrc;
  void _iswc;
  void _stems;
  void _splits;
  void _synced;
  // `rest` includes plain `lyrics` (public); syncedLyrics stays internal.
  return { ...rest, audioFile: t.audioFile ? trackAudioHref(t.id) : t.audioFile };
}
