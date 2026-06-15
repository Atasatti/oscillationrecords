import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PHOTOS = 30;

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    if (!Array.isArray(body.photos)) {
      return NextResponse.json(
        { error: "photos must be an array of image URLs" },
        { status: 400 }
      );
    }

    const photos = body.photos
      .map((p: unknown) => (typeof p === "string" ? p.trim() : ""))
      .filter((p: string) => p.length > 0);

    if (photos.length > MAX_PHOTOS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_PHOTOS} photos is allowed` },
        { status: 400 }
      );
    }

    // Upsert requires the non-null stacked-hero fields when creating the row for
    // the first time; reuse the studio photos (or empty string) as placeholders.
    await prisma.siteSettings.upsert({
      where: { id: "site" },
      create: {
        id: "site",
        stackedHeroImage1: photos[0] ?? "",
        stackedHeroImage2: photos[1] ?? "",
        stackedHeroImage3: photos[2] ?? "",
        studioPhotos: photos,
      },
      update: {
        studioPhotos: photos,
      },
    });

    revalidatePath("/");

    return NextResponse.json({ photos });
  } catch (error) {
    console.error("Error saving studio photos:", error);
    return NextResponse.json(
      { error: "Failed to save studio photos" },
      { status: 500 }
    );
  }
}
