/**
 * Server-only Spotify Web API helper (client-credentials flow) for admin artist
 * enrichment. No user OAuth — just an app token to read public catalog data.
 * Requires SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET; if absent, isConfigured()
 * is false and callers should surface a "not configured" state (the editor then
 * hides the Import button and admins enter data manually).
 */

export interface SpotifyArtist {
  id: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  followers: number | null;
  spotifyUrl: string | null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 5000) {
    return cachedToken.value;
  }
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify is not configured");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000 - 60_000,
  };
  return cachedToken.value;
}

interface RawArtist {
  id: string;
  name: string;
  genres?: string[];
  followers?: { total?: number };
  images?: { url: string; width: number; height: number }[];
  external_urls?: { spotify?: string };
}

function normalize(a: RawArtist): SpotifyArtist {
  // Spotify returns images largest-first; take the first as the avatar.
  const imageUrl = a.images && a.images.length > 0 ? a.images[0].url : null;
  return {
    id: a.id,
    name: a.name,
    imageUrl,
    genres: a.genres ?? [],
    followers: a.followers?.total ?? null,
    spotifyUrl: a.external_urls?.spotify ?? null,
  };
}

export async function searchArtists(q: string, limit = 8): Promise<SpotifyArtist[]> {
  const query = q.trim();
  if (!query) return [];
  const token = await getToken();
  const url = `https://api.spotify.com/v1/search?type=artist&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);
  const data = (await res.json()) as { artists?: { items?: RawArtist[] } };
  return (data.artists?.items ?? []).map(normalize);
}

export async function getArtist(id: string): Promise<SpotifyArtist | null> {
  const token = await getToken();
  const res = await fetch(`https://api.spotify.com/v1/artists/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Spotify artist fetch failed: ${res.status}`);
  return normalize((await res.json()) as RawArtist);
}
