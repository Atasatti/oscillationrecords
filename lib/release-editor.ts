// Shared, client-safe helpers for the Release Editor surfaces. No server imports.
import { normalizeFeatureArtistNamesInput } from "@/lib/release-format";

/**
 * Read an error message from a failed Response without crashing on an HTML
 * error page (which produced the cryptic "Unexpected token '<'" JSON error).
 * Falls back to the HTTP status.
 */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    if ((res.headers.get("content-type") || "").includes("application/json")) {
      const j = await res.json();
      return (j && j.error) || `${fallback} (HTTP ${res.status})`;
    }
  } catch {
    /* fall through */
  }
  return `${fallback} (HTTP ${res.status})`;
}

/** Read an audio file's duration (seconds, floored) in the browser. 0 on failure. */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? Math.floor(audio.duration) : 0;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

const sanitizePart = (name: string) => name.replace(/[^a-zA-Z0-9.-]/g, "_");

/** S3 key for a track's audio file (mirrors the existing convention). */
export function audioKey(file: File, ts: number): string {
  return `tracks/audio/${ts}-${sanitizePart(file.name)}`;
}

/** S3 key for a track's stems file. */
export function stemsKey(file: File, ts: number): string {
  return `tracks/stems/${ts}-${sanitizePart(file.name)}`;
}

/** A clean release/track title guessed from an audio filename (drop extension). */
export function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
}

/** True for browser-recognised audio files (by MIME or extension). */
export function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|flac|m4a|aac|ogg|oga|aif|aiff|alac)$/i.test(file.name)
  );
}

/** mm:ss from seconds (— when zero/unknown). */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Track credits — the 5-category model shared by the dialog + the editor.
// ---------------------------------------------------------------------------

export type CreditCategory =
  | "composer"
  | "songwriter"
  | "production_engineer"
  | "performer"
  | "custom";

/** Row as stored in the DB JSON column. */
export type TrackCreditJsonRow = {
  category: CreditCategory | "other";
  name: string;
  role: string;
};

export type NameRoleRow = { name: string; role: string };

export const SONGWRITER_ROLES = [
  "Arranger",
  "Author",
  "Conductor",
  "Librettist",
  "Lyricist",
];
export const PRODUCTION_ROLES = [
  "Assistant Producer",
  "Mastering Engineer",
  "Mixing Engineer",
  "Musical Director",
  "Producer",
  "Sound Engineer",
];
export const PERFORMER_ROLES = [
  "Acoustic Guitar",
  "Alto Saxophone",
  "Background Vocals",
  "Banjo",
  "Baritone Saxophone",
  "Bass Clarinet",
  "Bass Guitar",
  "Bass Trombone",
  "Bassoon",
  "Bongos",
  "Bouzouki",
  "Cello",
  "Choir",
  "Chorus",
  "Clarinet",
  "Classical Guitar",
  "Congas",
  "Cornet",
  "DJ",
  "Djembe",
  "Double Bass",
  "Drums",
  "Electric Guitar",
  "Fiddle",
  "First Violin",
  "Flugelhorn",
  "Flute",
  "Guitar",
  "Hammond Organ",
  "Harmonica",
  "Harmony Vocals",
  "Harp",
  "Harpsichord",
  "Keyboards",
  "Kora",
  "Lead Guitar",
  "Lead Vocals",
  "Mandolin",
  "Mezzo-soprano Vocals",
  "Oboe",
  "Organ",
  "Pedal Steel Guitar",
  "Percussion",
  "Performer",
  "Piano",
  "Piccolo",
  "Remixer",
  "Rhodes Piano",
  "Rhythm Guitar",
  "Saxophone",
  "Second Violin",
  "Sitar",
  "Sopranino Saxophone",
  "Tabla",
  "Tambourine",
  "Tenor Saxophone",
  "Timbales",
  "Timpani",
  "Trombone",
  "Trumpet",
  "Tuba",
  "Ukulele",
  "Viola",
  "Violin",
];

export interface TrackCreditsValue {
  composerNames: string[];
  songwriterRows: NameRoleRow[];
  productionRows: NameRoleRow[];
  performerRows: NameRoleRow[];
  customRows: NameRoleRow[];
}

export function emptyTrackCredits(): TrackCreditsValue {
  return {
    composerNames: [""],
    songwriterRows: [{ name: "", role: "" }],
    productionRows: [{ name: "", role: "" }],
    performerRows: [{ name: "", role: "" }],
    customRows: [],
  };
}

/** Flatten the 5-category credit UI into the stored JSON rows (drops blanks). */
export function creditPayload(v: TrackCreditsValue): TrackCreditJsonRow[] {
  const out: TrackCreditJsonRow[] = [];
  for (const name of v.composerNames) {
    const n = name.trim();
    if (n) out.push({ category: "composer", name: n, role: "" });
  }
  for (const r of v.songwriterRows) {
    if (r.name.trim() && r.role.trim())
      out.push({ category: "songwriter", name: r.name.trim(), role: r.role.trim() });
  }
  for (const r of v.productionRows) {
    if (r.name.trim() && r.role.trim())
      out.push({ category: "production_engineer", name: r.name.trim(), role: r.role.trim() });
  }
  for (const r of v.performerRows) {
    if (r.name.trim() && r.role.trim())
      out.push({ category: "performer", name: r.name.trim(), role: r.role.trim() });
  }
  for (const r of v.customRows) {
    if (r.name.trim() && r.role.trim())
      out.push({ category: "custom", name: r.name.trim(), role: r.role.trim() });
  }
  return out;
}

/** Parse stored credit JSON (+ legacy single-field credits) into the UI model. */
export function parseStoredCredits(
  raw: unknown,
  legacy: { composer?: string | null; lyricist?: string | null; leadVocal?: string | null }
): TrackCreditsValue {
  const composerNames: string[] = [];
  const songwriterRows: NameRoleRow[] = [];
  const productionRows: NameRoleRow[] = [];
  const performerRows: NameRoleRow[] = [];
  const customRows: NameRoleRow[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const category = String(row.category || "");
      const name = String(row.name || "").trim();
      const role = String(row.role || "").trim();
      if (category === "composer" && name) composerNames.push(name);
      else if (category === "songwriter") songwriterRows.push({ name, role });
      else if (category === "production_engineer") productionRows.push({ name, role });
      else if (category === "performer") performerRows.push({ name, role });
      else if (category === "custom" || category === "other") customRows.push({ name, role });
    }
  }

  if (composerNames.length === 0 && legacy.composer?.trim())
    composerNames.push(legacy.composer.trim());
  if (songwriterRows.length === 0 && legacy.lyricist?.trim())
    songwriterRows.push({ name: legacy.lyricist.trim(), role: "Lyricist" });
  if (performerRows.length === 0 && legacy.leadVocal?.trim())
    performerRows.push({ name: legacy.leadVocal.trim(), role: "Lead Vocals" });

  const ensured = (rows: NameRoleRow[]) => (rows.length > 0 ? rows : [{ name: "", role: "" }]);
  return {
    composerNames: composerNames.length > 0 ? composerNames : [""],
    songwriterRows: ensured(songwriterRows),
    productionRows: ensured(productionRows),
    performerRows: ensured(performerRows),
    customRows,
  };
}

/** A half-filled name/role row (one without the other) is invalid. */
export function nameRoleRowsValid(rows: NameRoleRow[]): boolean {
  return rows.every((r) => Boolean(r.name.trim()) === Boolean(r.role.trim()));
}

// ---------------------------------------------------------------------------
// Editor track model — the in-memory row the Release Editor manipulates.
// ---------------------------------------------------------------------------

export interface EditorTrack {
  /** Stable client id (drag + upload mapping); not persisted. */
  rowId: string;
  /** Server id once persisted. */
  id?: string;
  name: string;
  audioFile: string;
  duration: number;
  image: string | null;
  lyrics: string;
  isrcCode: string;
  iswc: string;
  isrcExplicit: boolean;
  stemsFile: string;
  spotifyLink: string;
  appleMusicLink: string;
  tidalLink: string;
  amazonMusicLink: string;
  youtubeLink: string;
  soundcloudLink: string;
  primaryArtistIds: string[];
  featureArtistText: string;
  credits: TrackCreditsValue;
  expanded: boolean;
}

let rowSeq = 0;
/** Generate a unique client row id (browser-only contexts). */
export function makeRowId(): string {
  rowSeq += 1;
  return `row-${Date.now().toString(36)}-${rowSeq}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A blank editor track, seeded with the release's default primary artists. */
export function newEditorTrack(
  defaults: { name?: string; primaryArtistIds?: string[]; featureArtistText?: string } = {}
): EditorTrack {
  return {
    rowId: makeRowId(),
    name: defaults.name ?? "",
    audioFile: "",
    duration: 0,
    image: null,
    lyrics: "",
    isrcCode: "",
    iswc: "",
    isrcExplicit: false,
    stemsFile: "",
    spotifyLink: "",
    appleMusicLink: "",
    tidalLink: "",
    amazonMusicLink: "",
    youtubeLink: "",
    soundcloudLink: "",
    primaryArtistIds: [...(defaults.primaryArtistIds ?? [])],
    featureArtistText: defaults.featureArtistText ?? "",
    credits: emptyTrackCredits(),
    expanded: false,
  };
}

/** Map a track from GET /api/releases/[id] (serializeTrack shape) into a row. */
export function editorTrackFromSerialized(
  t: Record<string, unknown>,
  artists: { id: string; name: string }[]
): EditorTrack {
  const featureNames = Array.isArray(t.featureArtistNames)
    ? (t.featureArtistNames as string[]).filter(Boolean)
    : [];
  const featureFromIds = Array.isArray(t.featureArtistIds)
    ? (t.featureArtistIds as string[])
        .map((id) => artists.find((a) => a.id === id)?.name)
        .filter((n): n is string => Boolean(n))
    : [];
  return {
    rowId: makeRowId(),
    id: t.id ? String(t.id) : undefined,
    name: String(t.name ?? ""),
    audioFile: String(t.audioFile ?? ""),
    duration: typeof t.duration === "number" ? t.duration : 0,
    image: t.image != null ? String(t.image) : null,
    lyrics: t.lyrics ? String(t.lyrics) : "",
    isrcCode: t.isrcCode ? String(t.isrcCode) : "",
    iswc: t.iswc ? String(t.iswc) : "",
    isrcExplicit: Boolean(t.isrcExplicit),
    stemsFile: t.stemsFile ? String(t.stemsFile) : "",
    spotifyLink: t.spotifyLink ? String(t.spotifyLink) : "",
    appleMusicLink: t.appleMusicLink ? String(t.appleMusicLink) : "",
    tidalLink: t.tidalLink ? String(t.tidalLink) : "",
    amazonMusicLink: t.amazonMusicLink ? String(t.amazonMusicLink) : "",
    youtubeLink: t.youtubeLink ? String(t.youtubeLink) : "",
    soundcloudLink: t.soundcloudLink ? String(t.soundcloudLink) : "",
    primaryArtistIds: Array.isArray(t.primaryArtistIds)
      ? (t.primaryArtistIds as string[])
      : [],
    featureArtistText: (featureNames.length ? featureNames : featureFromIds).join(", "),
    credits: parseStoredCredits(t.trackCredits, {
      composer: (t.composer as string) ?? null,
      lyricist: (t.lyricist as string) ?? null,
      leadVocal: (t.leadVocal as string) ?? null,
    }),
    expanded: false,
  };
}

/** Per-track problems that block a RELEASED publish (empty = ready). */
export function trackPublishIssues(row: EditorTrack, requireIsrc: boolean): string[] {
  const issues: string[] = [];
  if (!row.name.trim()) issues.push("name");
  if (!row.audioFile || row.duration <= 0) issues.push("audio");
  if (row.primaryArtistIds.length === 0) issues.push("artist");
  if (requireIsrc && !row.isrcCode.trim()) issues.push("ISRC");
  return issues;
}

/** True once a row can be persisted as a track (new rows need audio first). */
export function trackIsPersistable(row: EditorTrack): boolean {
  if (!row.name.trim()) return false;
  if (row.primaryArtistIds.length === 0) return false;
  // Existing tracks may keep their audio implicitly; new ones need a fileURL.
  if (!row.id && (!row.audioFile || row.duration <= 0)) return false;
  return true;
}

/** Build the PATCH track payload (matches parseTrackInput on the server). */
export function buildTrackPayload(
  row: EditorTrack,
  sortOrder: number
): Record<string, unknown> {
  const composerJoined =
    row.credits.composerNames.map((n) => n.trim()).filter(Boolean).join(", ") || null;
  const payload: Record<string, unknown> = {
    name: row.name.trim(),
    image: row.image,
    audioFile: row.audioFile,
    duration: row.duration,
    composer: composerJoined,
    lyricist: null,
    leadVocal: null,
    lyrics: row.lyrics.trim() || null,
    stemsFile: row.stemsFile || null,
    trackCredits: creditPayload(row.credits),
    isrcCode: row.isrcCode.trim() || null,
    iswc: row.iswc.trim() || null,
    isrcExplicit: row.isrcExplicit,
    spotifyLink: row.spotifyLink.trim() || null,
    appleMusicLink: row.appleMusicLink.trim() || null,
    tidalLink: row.tidalLink.trim() || null,
    amazonMusicLink: row.amazonMusicLink.trim() || null,
    youtubeLink: row.youtubeLink.trim() || null,
    soundcloudLink: row.soundcloudLink.trim() || null,
    primaryArtistIds: row.primaryArtistIds,
    featureArtistNames: normalizeFeatureArtistNamesInput(row.featureArtistText),
    sortOrder,
  };
  if (row.id) payload.id = row.id;
  return payload;
}
