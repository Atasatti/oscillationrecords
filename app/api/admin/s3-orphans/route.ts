import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { isCronAuthorized } from "@/lib/cron";
import { recordAudit } from "@/lib/audit";
import { S3_BUCKET, keyFromOwnBucketUrl, s3Client, s3Configured } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Prefixes that hold catalog audio, incl. the legacy pre-unification paths.
// Mirrors scripts/cleanup-orphaned-audio.mjs (the offline, deeper-scanning twin).
const AUDIO_PREFIXES = [
  "tracks/audio/",
  "tracks/stems/",
  "singles/audio/",
  "eps/audio/",
  "albums/audio/",
];

// An object younger than this is skipped: a presigned upload that hasn't been
// attached to a track yet is legitimately unreferenced for a while, and a
// periodic report that cries wolf about in-flight uploads would get ignored.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

// Response cap so a pathological bucket can't produce a megabyte report; the
// counts are always the full totals.
const MAX_LISTED = 100;

// GET /api/admin/s3-orphans — REPORT-ONLY scan for audio objects no catalog
// record references (the periodic half of the orphan lifecycle; audit #6).
// Deletes nothing: review happens here, cleanup via the sweeps in lib/s3-sweep
// or scripts/cleanup-orphaned-audio.mjs --apply. Owner-only, or a scheduler
// presenting CRON_SECRET (same dual auth as the daily digest) — point a monthly
// cron here and the result lands in the response + an audit entry.
export async function GET(request: NextRequest) {
  const cron = isCronAuthorized(request);
  let token = null;
  if (!cron) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    token = guard.token;
  }

  if (!s3Configured() || !s3Client) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }

  try {
    // Every audio-prefix key the catalog still references. Track fields +
    // DAM assets cover audio; the offline script's generic all-collection scan
    // stays the authority before any actual deletion.
    const [tracks, assets] = await Promise.all([
      prisma.track.findMany({ select: { audioFile: true, stemsFile: true, image: true } }),
      prisma.asset.findMany({ select: { fileUrl: true, fileKey: true } }),
    ]);
    const referenced = new Set<string>();
    const addUrl = (url: string | null) => {
      if (!url) return;
      const key = keyFromOwnBucketUrl(url);
      if (key) referenced.add(key);
    };
    for (const t of tracks) { addUrl(t.audioFile); addUrl(t.stemsFile); addUrl(t.image); }
    for (const a of assets) { addUrl(a.fileUrl); if (a.fileKey) referenced.add(a.fileKey); }

    const cutoff = Date.now() - MIN_AGE_MS;
    const orphans: { key: string; size: number; lastModified: string | null }[] = [];
    let scanned = 0;
    let orphanBytes = 0;
    let skippedRecent = 0;

    for (const Prefix of AUDIO_PREFIXES) {
      let token2: string | undefined;
      do {
        const r = await s3Client.send(
          new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix, ContinuationToken: token2 })
        );
        for (const o of r.Contents ?? []) {
          scanned += 1;
          if (!o.Key || referenced.has(o.Key)) continue;
          if (o.LastModified && o.LastModified.getTime() > cutoff) {
            skippedRecent += 1; // likely an in-flight upload — not an orphan yet
            continue;
          }
          orphanBytes += o.Size ?? 0;
          orphans.push({
            key: o.Key,
            size: o.Size ?? 0,
            lastModified: o.LastModified?.toISOString() ?? null,
          });
        }
        token2 = r.NextContinuationToken;
      } while (token2);
    }

    orphans.sort((a, b) => b.size - a.size);

    // Leave a reviewable trace when something was actually found — the report
    // is pull-only otherwise, and a cron result nobody reads isn't a report.
    if (orphans.length > 0) {
      await recordAudit(request, token, {
        action: "scan",
        resource: "storage",
        summary: `Orphaned-audio scan found ${orphans.length} unreferenced file(s), ${(orphanBytes / 1e6).toFixed(1)} MB`,
        metadata: { orphanCount: orphans.length, orphanBytes, scanned, trigger: cron ? "cron" : "admin" },
      });
    }

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      prefixes: AUDIO_PREFIXES,
      scanned,
      referenced: referenced.size,
      skippedRecent,
      orphanCount: orphans.length,
      orphanBytes,
      orphans: orphans.slice(0, MAX_LISTED),
      note:
        orphans.length > 0
          ? "Report only — nothing was deleted. Quarantine via scripts/cleanup-orphaned-audio.mjs --apply."
          : "No orphaned audio.",
    });
  } catch (e) {
    console.error("s3-orphans scan error:", e);
    return NextResponse.json({ error: "Failed to scan for orphans" }, { status: 500 });
  }
}
