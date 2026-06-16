import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { isConfigured, searchArtists } from "@/lib/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/spotify/search?q= — admin-only Spotify artist search for the
// artist editor's "Import from Spotify" flow. 503 when credentials are absent.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Spotify is not configured", configured: false },
      { status: 503 }
    );
  }

  const q = new URL(request.url).searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ artists: [] });

  try {
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
