import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { pullLyrics, MxmThrottledError } from "@/lib/musixmatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/admin/lyrics/pull  { isrc?, title?, artist? }
// Fetches one track's lyrics from Musixmatch (ISRC-first, exact title+artist
// fallback) so an admin can review + save them in the release editor. Catalog-gated;
// reads from Musixmatch only, never writes to the DB. Matches the sibling editor
// helper /api/admin/artists/search on the auth model.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;

  // Musixmatch rate-limits; keep an admin from hammering it (and burning our token).
  const rl = rateLimit(`mxm-pull:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { lyrics: null, note: `Too many pulls — try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { isrc?: unknown; title?: unknown; artist?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ lyrics: null, note: "Invalid request body." }, { status: 400 });
  }

  const isrc = typeof body.isrc === "string" ? body.isrc.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const artist = typeof body.artist === "string" ? body.artist.trim() : "";

  if (!isrc && !(title && artist)) {
    return NextResponse.json(
      { lyrics: null, note: "Provide an ISRC, or a track name and primary artist." },
      { status: 400 }
    );
  }

  try {
    const result = await pullLyrics({ isrc, title, artist });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof MxmThrottledError) {
      return NextResponse.json(
        {
          lyrics: null,
          note: "Musixmatch is throttling token requests — wait a moment and try again.",
        },
        { status: 503 }
      );
    }
    console.error("lyrics pull error:", e);
    return NextResponse.json(
      { lyrics: null, note: "Couldn't reach Musixmatch. Try again." },
      { status: 502 }
    );
  }
}
