import type { Artist, Release, Track } from "@prisma/client";

export type ApiReleaseKind = "single" | "ep" | "album";

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
    featureArtistNames: t.featureArtistNames ?? [],
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Public payloads: omit ISRC, ISWC and lyrics — admin session still uses full {@link serializeTrack}. */
export function serializeTrackForPublic(
  t: Track
): Omit<ReturnType<typeof serializeTrack>, "isrcCode" | "iswc" | "lyrics"> {
  const { isrcCode: _isrc, iswc: _iswc, lyrics: _lyrics, ...rest } = serializeTrack(t);
  void _isrc;
  void _iswc;
  void _lyrics;
  return rest;
}
