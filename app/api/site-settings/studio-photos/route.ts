import { NextResponse } from "next/server";
import { getStudioPhotos } from "@/lib/site-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const photos = await getStudioPhotos();
    return NextResponse.json(
      { photos },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching studio photos:", error);
    return NextResponse.json(
      { error: "Failed to load studio photos" },
      { status: 500 }
    );
  }
}
