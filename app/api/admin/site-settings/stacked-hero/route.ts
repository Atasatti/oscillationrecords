import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const image1 = typeof body.image1 === "string" ? body.image1.trim() : "";
    const image2 = typeof body.image2 === "string" ? body.image2.trim() : "";
    const image3 = typeof body.image3 === "string" ? body.image3.trim() : "";

    if (!image1 || !image2 || !image3) {
      return NextResponse.json(
        { error: "image1, image2, and image3 are required" },
        { status: 400 }
      );
    }

    await prisma.siteSettings.upsert({
      where: { id: "site" },
      create: {
        id: "site",
        stackedHeroImage1: image1,
        stackedHeroImage2: image2,
        stackedHeroImage3: image3,
      },
      update: {
        stackedHeroImage1: image1,
        stackedHeroImage2: image2,
        stackedHeroImage3: image3,
      },
    });

    revalidatePath("/");

    return NextResponse.json({
      image1,
      image2,
      image3,
    });
  } catch (error) {
    console.error("Error saving stacked hero images:", error);
    return NextResponse.json(
      { error: "Failed to save stacked hero images" },
      { status: 500 }
    );
  }
}
