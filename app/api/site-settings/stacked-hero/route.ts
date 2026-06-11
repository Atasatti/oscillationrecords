import { NextResponse } from "next/server";
import { getStackedHeroImages } from "@/lib/site-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const images = await getStackedHeroImages();
    return NextResponse.json(images, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    console.error("Error fetching stacked hero images:", error);
    return NextResponse.json(
      { error: "Failed to load stacked hero images" },
      { status: 500 }
    );
  }
}
