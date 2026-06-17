// Shared, client-safe helpers for the release/track editing surfaces
// (TrackFormDialog today; the new Release Editor next). No server imports.

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
