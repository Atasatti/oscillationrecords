import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { isConfigured, searchArtists, searchAlbums } from "@/lib/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/spotify/search?q=             — Spotify artist search (artist editor)
// GET /api/admin/spotify/search?q=&type=album  — Spotify album search (release editor)
// Admin-only "Import from Spotify" backend. Returns 200 { configured: false } when
// credentials are absent (NOT an error — the editors read it to hide the Import
// button); 502 only if a *configured* Spotify call actually fails.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  if (!isConfigured()) {
    // Not configured ≠ server error. Return 200 so it doesn't spam logs/monitoring
    // with 503s on every editor mount; the editors hide Import on configured:false.
    return NextResponse.json({ configured: false, artists: [], albums: [] });
  }

  const params = new URL(request.url).searchParams;
  const q = params.get("q") || "";
  const type = params.get("type");

  try {
    if (type === "album") {
      if (!q.trim()) return NextResponse.json({ albums: [] });
      const albums = await searchAlbums(q);
      return NextResponse.json({ albums });
    }
    if (!q.trim()) return NextResponse.json({ artists: [] });
    const artists = await searchArtists(q);
    return NextResponse.json({ artists });
  } catch (error) {
    console.error("Spotify search error:", error);
    return NextResponse.json(
      { error: "Spotify search failed" },
      { status: 502 }
    );
  }
}
