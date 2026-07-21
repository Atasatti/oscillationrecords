import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/object-id";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeSplits, summarizeSplits, type Split } from "@/lib/release-splits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// For splits linked to a roster artist, the artist's PROFILE is the source of truth
// for the contributor's real name / contact email. Resolve them fresh from the
// profile so the editor shows exactly what's on file (and, by leaving a field empty
// when the profile has none, signals which details are still missing and editable).
// Manual (unlinked) rows are returned untouched.
async function resolveSplitsFromProfiles(splits: Split[]): Promise<Split[]> {
  const ids = [...new Set(splits.map((s) => s.artistId).filter((x): x is string => !!x))];
  if (ids.length === 0) return splits;
  const artists = await prisma.artist.findMany({
    where: { id: { in: ids } },
    select: { id: true, realName: true, contactEmail: true },
  });
  const byId = new Map(artists.map((a) => [a.id, a]));
  return splits.map((s) => {
    const a = s.artistId ? byId.get(s.artistId) : undefined;
    return a ? { ...s, realName: a.realName ?? null, email: a.contactEmail ?? null } : s;
  });
}

// GET /api/releases/[releaseId]/splits — the release's revenue-split agreement.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { splits: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    const splits = await resolveSplitsFromProfiles(normalizeSplits(release.splits));
    return NextResponse.json(summarizeSplits(splits), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("release splits GET error:", e);
    return NextResponse.json({ error: "Failed to load splits" }, { status: 500 });
  }
}

// PUT /api/releases/[releaseId]/splits { splits: [{payee, percent}] } — replace
// the split agreement. Catalog-gated (write) + audited.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const splits = normalizeSplits(body?.splits);

    const existing = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true },
    });
    if (!existing) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    // Write contributor details entered against a LINKED artist back to that artist's
    // profile — but only fill fields the profile is MISSING (never overwrite what's on
    // file). The editor shows on-file fields read-only, so anything sent here for a
    // linked artist is a detail the profile lacked; persist it so the profile stays
    // the single source of truth.
    //
    // Authorization: this route already requires catalog:write (top of PUT) — the SAME
    // permission the artist-edit endpoints (PUT/PATCH /api/artists/[id]) require — and
    // the catalog is single-tenant with no per-artist ownership (no labelId/owner on
    // Artist). So filling a blank field here is a strict SUBSET of what the caller can
    // already do by editing the artist directly (which also allows overwrite); it
    // crosses no authorization boundary and is not an IDOR / cross-tenant write.
    //
    // Best-effort and per-artist guarded: a write-back failure must not sink the split
    // save.
    const linkedIds = [...new Set(splits.map((s) => s.artistId).filter((x): x is string => !!x))];
    if (linkedIds.length) {
      const artists = await prisma.artist.findMany({
        where: { id: { in: linkedIds } },
        select: { id: true, name: true, realName: true, contactEmail: true },
      });
      const byId = new Map(artists.map((a) => [a.id, a]));
      for (const s of splits) {
        if (!s.artistId) continue;
        const a = byId.get(s.artistId);
        if (!a) continue;
        const patch: { realName?: string; contactEmail?: string } = {};
        if (!a.realName?.trim() && s.realName?.trim()) patch.realName = s.realName.trim();
        if (!a.contactEmail?.trim() && s.email?.trim()) patch.contactEmail = s.email.trim();
        if (Object.keys(patch).length === 0) continue;
        try {
          await prisma.artist.update({ where: { id: a.id }, data: patch });
          const fields = Object.keys(patch)
            .map((k) => (k === "contactEmail" ? "contact email" : "real name"))
            .join(" + ");
          await recordAudit(request, guard.token, {
            action: "update",
            resource: "artist",
            resourceId: a.id,
            summary: `Saved ${fields} to "${a.name}" from the "${existing.name}" royalty split`,
            metadata: patch,
          });
        } catch (e) {
          console.error("split → artist writeback failed", a.id, e);
        }
      }
    }

    await prisma.release.update({
      where: { id: releaseId },
      data: { splits: splits as unknown as Prisma.InputJsonValue },
    });

    const summary = summarizeSplits(splits);
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Updated revenue splits on "${existing.name}" (${splits.length} payee${splits.length === 1 ? "" : "s"}, ${summary.total}%)`,
      metadata: { splits },
    });

    return NextResponse.json(summary);
  } catch (e) {
    console.error("release splits PUT error:", e);
    return NextResponse.json({ error: "Failed to save splits" }, { status: 500 });
  }
}
