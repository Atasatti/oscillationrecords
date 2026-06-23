import { NextResponse } from "next/server";
import { getPageMedia } from "@/lib/page-media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public: the effective decorative images for the marketing pages (overrides
// merged over built-in defaults). Read by the client `usePageMedia` hook.
export async function GET() {
  try {
    const media = await getPageMedia();
    return NextResponse.json(media, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    console.error("Error fetching page media:", error);
    return NextResponse.json({ error: "Failed to load page media" }, { status: 500 });
  }
}
