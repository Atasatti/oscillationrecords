import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import {
  searchArtists,
  getArtistDetails,
  searchReleases,
  getReleaseDetails,
} from "@/lib/musicbrainz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Artist enrichment:
//   GET ?q=<name>                       → { artists: MbArtistMatch[] }
//   GET ?mbid=<mbid>                    → { links, isnis, ipis, genres }
// Release enrichment (for the release editor's streaming-link import):
//   GET ?type=release&q=<title>         → { releases: MbReleaseMatch[] }
//   GET ?type=release&releaseMbid=<id>  → { links }
// Admin-only free streaming-link enrichment. No API key required, so it's
// always "available" (unlike Spotify).
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const mbid = params.get("mbid");
  const releaseMbid = params.get("releaseMbid");
  const q = params.get("q");

  try {
    if (type === "release") {
      if (releaseMbid) {
        return NextResponse.json(await getReleaseDetails(releaseMbid));
      }
      if (q && q.trim()) {
        return NextResponse.json({ releases: await searchReleases(q) });
      }
      return NextResponse.json({ releases: [] });
    }
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
