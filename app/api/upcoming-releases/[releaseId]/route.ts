import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TYPES = new Set(["single", "ep", "album"]);

function normalizeOptionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function validateUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { releaseId } = await params;
    const existing = await prisma.upcomingRelease.findUnique({
      where: { id: releaseId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Upcoming release not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const update: {
      name?: string;
      type?: string;
      image?: string;
      releaseDate?: Date;
      preSmartLinkUrl?: string | null;
      primaryArtist?: string | null;
      featureArtist?: string | null;
    } = {};

    if (body.name !== undefined) {
      if (!body.name || !String(body.name).trim()) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      update.name = String(body.name).trim();
    }

    if (body.type !== undefined) {
      const normalizedType = String(body.type).toLowerCase();
      if (!VALID_TYPES.has(normalizedType)) {
        return NextResponse.json(
          { error: "type must be one of: single, ep, album" },
          { status: 400 }
        );
      }
      update.type = normalizedType;
    }

    if (body.image !== undefined) {
      if (!body.image || !String(body.image).trim()) {
        return NextResponse.json({ error: "image cannot be empty" }, { status: 400 });
      }
      update.image = String(body.image).trim();
    }

    if (body.releaseDate !== undefined) {
      const parsedDate = new Date(body.releaseDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid releaseDate" }, { status: 400 });
      }
      update.releaseDate = parsedDate;
    }

    if (body.preSmartLinkUrl !== undefined) {
      const n = normalizeOptionalString(body.preSmartLinkUrl);
      if (n === null || n === undefined) {
        update.preSmartLinkUrl = null;
      } else if (!validateUrl(n)) {
        return NextResponse.json(
          { error: "preSmartLinkUrl must be a valid http(s) URL" },
          { status: 400 }
        );
      } else {
        update.preSmartLinkUrl = n;
      }
    }

    if (body.primaryArtist !== undefined) {
      const n = normalizeOptionalString(body.primaryArtist);
      update.primaryArtist = n === undefined ? null : n;
    }

    if (body.featureArtist !== undefined) {
      const n = normalizeOptionalString(body.featureArtist);
      update.featureArtist = n === undefined ? null : n;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.upcomingRelease.update({
      where: { id: releaseId },
      data: update,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating upcoming release:", error);
    return NextResponse.json(
      { error: "Failed to update upcoming release" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { releaseId } = await params;

    const existing = await prisma.upcomingRelease.findUnique({
      where: { id: releaseId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Upcoming release not found" },
        { status: 404 }
      );
    }

    await prisma.upcomingRelease.delete({
      where: { id: releaseId },
    });

    return NextResponse.json({ message: "Upcoming release deleted successfully" });
  } catch (error) {
    console.error("Error deleting upcoming release:", error);
    return NextResponse.json(
      { error: "Failed to delete upcoming release" },
      { status: 500 }
    );
  }
}
