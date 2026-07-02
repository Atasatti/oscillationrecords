import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import {
  computeReleaseReadiness,
  resolveDeliveryChecklist,
  DELIVERY_STEPS,
  DELIVERY_STEP_KEYS,
} from "@/lib/release-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/readiness — { metadata, delivery }:
//  - metadata: DERIVED delivery-readiness from the release's fields.
//  - delivery: the PERSISTED, human-ticked delivery/sign-off checklist.
// Catalog-gated (read).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: {
        coverImage: true,
        upcCode: true,
        primaryGenre: true,
        releaseDate: true,
        primaryArtistIds: true,
        deliveryChecklist: true,
        spotifyLink: true,
        appleMusicLink: true,
        tidalLink: true,
        amazonMusicLink: true,
        youtubeLink: true,
        soundcloudLink: true,
        tracks: { select: { isrcCode: true } },
      },
    });
    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const linkCount = [
      release.spotifyLink, release.appleMusicLink, release.tidalLink,
      release.amazonMusicLink, release.youtubeLink, release.soundcloudLink,
    ].filter(Boolean).length;

    const metadata = computeReleaseReadiness({
      hasCover: !!release.coverImage,
      trackCount: release.tracks.length,
      tracksMissingIsrc: release.tracks.filter((t) => !t.isrcCode?.trim()).length,
      hasUpc: !!release.upcCode?.trim(),
      hasReleaseDate: !!release.releaseDate,
      hasPrimaryArtist: release.primaryArtistIds.length > 0,
      hasGenre: !!release.primaryGenre?.trim(),
      linkCount,
    });

    const delivery = resolveDeliveryChecklist(release.deliveryChecklist);
    return NextResponse.json({ metadata, delivery }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release readiness GET error:", e);
    return NextResponse.json({ error: "Failed to compute readiness" }, { status: 500 });
  }
}

// PATCH /api/releases/[releaseId]/readiness { key, done } — tick/untick one
// persisted delivery-checklist step. Catalog-gated (write) + audited.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const body = await request.json().catch(() => ({}));
    const key = typeof body.key === "string" ? body.key : "";
    const done = body.done === true;
    if (!DELIVERY_STEP_KEYS.includes(key)) {
      return NextResponse.json({ error: "Unknown checklist step" }, { status: 400 });
    }

    const existing = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { name: true, deliveryChecklist: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const current =
      existing.deliveryChecklist && typeof existing.deliveryChecklist === "object"
        ? (existing.deliveryChecklist as Record<string, boolean>)
        : {};
    const next = { ...current, [key]: done };

    await prisma.release.update({
      where: { id: releaseId },
      data: { deliveryChecklist: next as Prisma.InputJsonValue },
    });

    const label = DELIVERY_STEPS.find((s) => s.key === key)?.label ?? key;
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `${done ? "Ticked" : "Un-ticked"} "${label}" on "${existing.name}"`,
      metadata: { step: key, done },
    });

    return NextResponse.json({ delivery: resolveDeliveryChecklist(next) });
  } catch (e) {
    console.error("release readiness PATCH error:", e);
    return NextResponse.json({ error: "Failed to update checklist" }, { status: 500 });
  }
}
