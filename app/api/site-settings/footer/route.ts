import { NextResponse } from "next/server";
import { getFooterSocialLinks } from "@/lib/footer-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const links = await getFooterSocialLinks();
    return NextResponse.json(links, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    console.error("Error fetching footer settings:", error);
    return NextResponse.json(
      { error: "Failed to load footer settings" },
      { status: 500 }
    );
  }
}
