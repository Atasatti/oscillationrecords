import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import {
  findWikidataMatches,
  artistNotabilitySignals,
  buildArtistQuickStatements,
  quickStatementsUrl,
  type ArtistForWikidata,
} from "@/lib/wikidata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/admin/wikidata/lookup — admin-only, READ-ONLY against Wikidata.
// Body is the artist's current (possibly unsaved) identifiers/details. Returns
// existing-item matches + a reviewed-creation QuickStatements draft + notability
// signals. Writes NOTHING to Wikidata — creation stays a human action.
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = (await request.json().catch(() => ({}))) as Partial<ArtistForWikidata> & {
      ipis?: unknown;
      genres?: unknown;
    };
    // ipis/genres may arrive as a comma-separated string (the editor's form state)
    // or an array — normalize both to a string[].
    const toList = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.map((x) => String(x).trim()).filter(Boolean)
        : typeof v === "string"
          ? v.split(",").map((x) => x.trim()).filter(Boolean)
          : [];
    const artist: ArtistForWikidata = {
      name: typeof body.name === "string" ? body.name : "",
      musicBrainzId: body.musicBrainzId ?? null,
      isni: body.isni ?? null,
      spotifyId: body.spotifyId ?? null,
      biography: body.biography ?? null,
      country: body.country ?? null,
      genres: toList(body.genres),
      ipis: toList(body.ipis),
      instagramLink: body.instagramLink ?? null,
      xLink: body.xLink ?? null,
      tiktokLink: body.tiktokLink ?? null,
      soundcloudLink: body.soundcloudLink ?? null,
      facebookLink: body.facebookLink ?? null,
      youtubeLink: body.youtubeLink ?? null,
    };
    if (!artist.name.trim()) {
      return NextResponse.json({ error: "Artist name is required" }, { status: 400 });
    }

    const { strong, candidates } = await findWikidataMatches(artist);
    const quickStatements = buildArtistQuickStatements(artist);

    return NextResponse.json({
      strong,
      candidates,
      signals: artistNotabilitySignals(artist),
      quickStatements,
      quickStatementsUrl: quickStatementsUrl(quickStatements),
    });
  } catch (error) {
    console.error("Wikidata lookup failed:", error);
    return NextResponse.json(
      { error: "Wikidata lookup failed — the public Wikidata service may be busy. Try again." },
      { status: 502 }
    );
  }
}
