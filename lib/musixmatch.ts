// Server-only Musixmatch lyrics client for the admin "Pull lyrics" action.
//
// Uses the desktop-app host apic-desktop.musixmatch.com with the token.get ->
// usertoken flow (no API key). That host is reachable through the corporate proxy,
// whereas www.musixmatch.com is Zscaler-blocked (error 54113). The Next.js server
// runs with `node --use-system-ca` (see package.json), so the corporate root CA is
// trusted and this fetch succeeds locally; on Vercel egress is open.
//
// Scope: pulls the LABEL'S OWN lyrics for an admin to review before saving. The
// endpoint reverse-engineers Musixmatch's internal API (ToS-gray) — a deliberate,
// documented choice for the label's own catalogue. Mirrors the offline
// scripts/musixmatch-pull-lyrics.py. See
// docs/superpowers/specs/2026-07-08-lyrics-hub-design.md.

const BASE = "https://apic-desktop.musixmatch.com/ws/1.1/";
const APP = "web-desktop-app-v1.0";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MusixmatchDesktop/1.0";

export type PullMethod = "isrc" | "search" | "none";

export interface PullResult {
  lyrics: string | null;
  method: PullMethod;
  /** The artist Musixmatch matched (search path only) — lets the admin sanity-check. */
  mxmArtist: string | null;
  note: string | null;
}

/** Thrown when Musixmatch won't hand out a usertoken (its token.get is rate-limited). */
export class MxmThrottledError extends Error {
  constructor() {
    super("Musixmatch token throttled");
    this.name = "MxmThrottledError";
  }
}

// --- response shapes (only the fields we read) -------------------------------
interface MxmTrack {
  track_id?: number;
  track_name?: string;
  artist_name?: string;
}
interface MxmBody {
  user_token?: string;
  lyrics?: { lyrics_body?: string; restricted?: number | boolean };
  track_list?: Array<{ track?: MxmTrack }>;
}
interface MxmResponse {
  message?: { header?: { status_code?: number }; body?: MxmBody };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normalize for exact title/artist comparison (mirror of the Python `norm`). */
function norm(s: string | null | undefined): string {
  return [...(s ?? "").toLowerCase()]
    .filter((c) => /[a-z0-9]/.test(c) || c === " ")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(text: string | null | undefined): string | null {
  if (!text) return null;
  let t = text;
  const marker = t.indexOf("*** This Lyrics"); // strip the commercial-use disclaimer
  if (marker !== -1) t = t.slice(0, marker);
  t = t.trim();
  return t || null;
}

async function mxmGet(path: string, params: Record<string, string>): Promise<MxmResponse> {
  const u = new URL(BASE + path);
  u.searchParams.set("app_id", APP);
  u.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") u.searchParams.set(k, v);
  }
  const res = await fetch(u, { headers: { "User-Agent": UA }, cache: "no-store" });
  return (await res.json()) as MxmResponse;
}

function statusOf(j: MxmResponse): number | null {
  const s = j?.message?.header?.status_code;
  return typeof s === "number" ? s : null;
}

function lyricsFrom(j: MxmResponse): string | null {
  const lyr = j?.message?.body?.lyrics;
  if (!lyr || typeof lyr !== "object" || lyr.restricted) return null;
  return clean(lyr.lyrics_body);
}

// --- usertoken (cached for the process; token.get is rate-limited) -----------
let cachedToken: string | null = null;

async function fetchToken(): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const j = await mxmGet("token.get", {});
      const tok = j?.message?.body?.user_token;
      if (typeof tok === "string" && tok && tok !== "UpgradeOnlyUponRequest") return tok;
    } catch {
      // transient network/parse hiccup — retry
    }
    await sleep(1200); // back off past the throttle
  }
  return null;
}

async function getToken(): Promise<string | null> {
  if (!cachedToken) cachedToken = await fetchToken();
  return cachedToken;
}

async function refreshToken(): Promise<string | null> {
  cachedToken = await fetchToken();
  return cachedToken;
}

/** GET a token-authenticated endpoint, refreshing the token once on a 401. */
async function authedGet(path: string, params: Record<string, string>): Promise<MxmResponse> {
  const tok = await getToken();
  if (!tok) throw new MxmThrottledError();
  let j = await mxmGet(path, { usertoken: tok, ...params });
  if (statusOf(j) === 401) {
    const fresh = await refreshToken();
    if (!fresh) throw new MxmThrottledError();
    j = await mxmGet(path, { usertoken: fresh, ...params });
  }
  return j;
}

async function pullByIsrc(isrc: string): Promise<string | null> {
  return lyricsFrom(await authedGet("track.lyrics.get", { track_isrc: isrc }));
}

async function pullBySearch(
  title: string,
  artist: string
): Promise<{ lyrics: string | null; mxmArtist: string | null }> {
  const j = await authedGet("track.search", {
    q_track: title,
    q_artist: artist,
    page_size: "5",
    page: "1",
  });
  const hits = j?.message?.body?.track_list ?? [];
  const nt = norm(title);
  const na = norm(artist);
  if (!na) return { lyrics: null, mxmArtist: null };
  for (const h of hits) {
    const tr = h?.track ?? {};
    // Require EXACT normalized title AND artist — a substring test would let
    // "Low" match "Flow" and pull a different artist's same-titled song.
    if (norm(tr.track_name) === nt && norm(tr.artist_name) === na) {
      const lyrics = lyricsFrom(await authedGet("track.lyrics.get", { track_id: String(tr.track_id) }));
      return { lyrics, mxmArtist: tr.artist_name ?? null };
    }
  }
  return { lyrics: null, mxmArtist: null };
}

/**
 * Pull lyrics for one track: ISRC first (authoritative — the exact recording),
 * then an exact title+artist search fallback. Returns the found lyrics + how it
 * matched, for the admin to review before saving. Never writes anything.
 */
export async function pullLyrics(input: {
  isrc?: string | null;
  title?: string | null;
  artist?: string | null;
}): Promise<PullResult> {
  const isrc = (input.isrc ?? "").trim();
  const title = (input.title ?? "").trim();
  const artist = (input.artist ?? "").trim();

  if (isrc) {
    const lyrics = await pullByIsrc(isrc);
    if (lyrics) return { lyrics, method: "isrc", mxmArtist: null, note: null };
  }
  if (title && artist) {
    const { lyrics, mxmArtist } = await pullBySearch(title, artist);
    if (lyrics) return { lyrics, method: "search", mxmArtist, note: null };
  }
  return {
    lyrics: null,
    method: "none",
    mxmArtist: null,
    note: isrc
      ? "No lyrics found for this ISRC on Musixmatch (it may be an instrumental, or not indexed)."
      : title && artist
        ? "No exact title + artist match on Musixmatch."
        : "Add an ISRC, or a track name and primary artist, then try again.",
  };
}
