import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/auth-guard";
import { isObjectId } from "@/lib/object-id";
import { isReleasePublic } from "@/lib/catalog-data";
import { S3_BUCKET, s3Client, s3Configured, keyFromOwnBucketUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/tracks/[trackId]/audio — the ONLY way track audio is served.
//
// PUBLIC route by design (no auth guard): tracks/audio/ is a private bucket
// prefix since the 2026-07-24 exposure incident, so this is the access-control
// point for catalog audio the way /api/assets/download is for the other private
// prefixes. Authorization is the owning RELEASE's visibility, not a staff
// permission: a track on a public release (RELEASED, or SCHEDULED whose date
// has arrived — same rule as every public reader, lib/catalog-data) streams for
// anyone; anything else (DRAFT, future-dated Coming-Soon) is served only to an
// admin session and 404s for the public, so unreleased masters never leak and
// draft existence isn't disclosed.
//
// Responds with a 302 to a 5-minute presigned GET (inline disposition). Media
// elements follow the redirect and issue their range requests against S3
// directly, so seeking costs one cheap re-auth here per seek, not a proxy
// stream through the app.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  try {
    const { trackId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(trackId)) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: {
        name: true,
        audioFile: true,
        release: { select: { status: true, releaseDate: true } },
      },
    });
    if (!track?.audioFile || !track.release) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    if (!isReleasePublic(track.release) && !(await isAdminRequest(request))) {
      // Same shape as the not-found response: a probe must not learn whether an
      // unreleased track id exists.
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const key = keyFromOwnBucketUrl(track.audioFile);
    if (!key) {
      // Legacy/external audio URL (not our bucket): it was never covered by the
      // bucket lockdown — just send the player there.
      if (/^https:\/\//.test(track.audioFile)) {
        return NextResponse.redirect(track.audioFile, 302);
      }
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    if (!s3Configured() || !s3Client) {
      return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
    }

    const signed = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 300 }
    );
    const res = NextResponse.redirect(signed, 302);
    // The redirect target embeds a signature — never cache the mapping.
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    console.error("track audio presign error:", e);
    return NextResponse.json({ error: "Failed to load audio" }, { status: 500 });
  }
}
