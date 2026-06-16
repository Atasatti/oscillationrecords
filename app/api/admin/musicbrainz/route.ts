import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { searchArtists, getArtistDetails } from "@/lib/musicbrainz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/musicbrainz?q=<name>      → { artists: MbArtistMatch[] }
// GET /api/admin/musicbrainz?mbid=<mbid>   → { links, isnis, ipis }
// Admin-only free social/streaming-link (+ ISNI/IPI) enrichment for the editor.
// No API key required, so it's always "available" (unlike Spotify).
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const mbid = params.get("mbid");
  const q = params.get("q");

  try {
    if (mbid) {
      const details = await getArtistDetails(mbid);
      return NextResponse.json(details);
    }
    if (q && q.trim()) {
      const artists = await searchArtists(q);
      return NextResponse.json({ artists });
    }
    return NextResponse.json({ artists: [] });
  } catch (error) {
    console.error("MusicBrainz lookup error:", error);
    return NextResponse.json(
      { error: "MusicBrainz lookup failed" },
      { status: 502 }
    );
  }
}
