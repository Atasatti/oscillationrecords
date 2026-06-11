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

function validateOptionalUrl(raw: string | null | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return undefined;
    }
    return raw;
  } catch {
    return undefined;
  }
}

export async function GET() {
  try {
    // Show today's and future releases. Previously this DELETED past rows on every
    // read — a destructive side effect that could drop a release scheduled for
    // "today". We now just filter (from the start of today) and never delete here.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const releases = await prisma.upcomingRelease.findMany({
      where: { releaseDate: { gte: startOfToday } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(releases);
  } catch (error) {
    console.error("Error fetching upcoming releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch upcoming releases" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, type, image, releaseDate } = body;
    const preSmartLinkUrlRaw = normalizeOptionalString(body.preSmartLinkUrl);
    const primaryArtist = normalizeOptionalString(body.primaryArtist);
    const featureArtist = normalizeOptionalString(body.featureArtist);

    if (!name || !type || !image || !releaseDate) {
      return NextResponse.json(
        { error: "name, type, image, and releaseDate are required" },
        { status: 400 }
      );
    }

    const normalizedType = String(type).toLowerCase();
    if (!VALID_TYPES.has(normalizedType)) {
      return NextResponse.json(
        { error: "type must be one of: single, ep, album" },
        { status: 400 }
      );
    }

    let preSmartLinkUrl: string | null = null;
    if (preSmartLinkUrlRaw) {
      const ok = validateOptionalUrl(preSmartLinkUrlRaw);
      if (!ok) {
        return NextResponse.json(
          { error: "preSmartLinkUrl must be a valid http(s) URL" },
          { status: 400 }
        );
      }
      preSmartLinkUrl = ok;
    }

    const parsedDate = new Date(releaseDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid releaseDate" }, { status: 400 });
    }

    const maxOrder = await prisma.upcomingRelease.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const created = await prisma.upcomingRelease.create({
      data: {
        name,
        type: normalizedType,
        image,
        releaseDate: parsedDate,
        sortOrder,
        preSmartLinkUrl,
        primaryArtist: primaryArtist ?? null,
        featureArtist: featureArtist ?? null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating upcoming release:", error);
    return NextResponse.json(
      { error: "Failed to create upcoming release" },
      { status: 500 }
    );
  }
}
