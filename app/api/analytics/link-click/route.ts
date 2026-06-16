import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CONTEXT = new Set(["release", "artist", "track"]);
const VALID_LINK = new Set([
  // streaming platforms
  "spotify",
  "appleMusic",
  "tidal",
  "amazonMusic",
  "youtube",
  "soundcloud",
  // artist socials
  "x",
  "tiktok",
  "instagram",
  "facebook",
]);

// POST /api/analytics/link-click — anonymous, rate-limited beacon recording an
// outbound streaming/social link click. Always returns 200-ish so it never
// interferes with the visitor leaving the page.
export async function POST(request: NextRequest) {
  const rl = rateLimit(`linkclick:${clientIp(request)}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  try {
    const body = await request.json();
    const context = String(body.context || "");
    const contextId = String(body.contextId || "");
    const linkType = String(body.linkType || "");
    if (!VALID_CONTEXT.has(context) || !VALID_LINK.has(linkType) || !contextId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const contextName =
      typeof body.contextName === "string" ? body.contextName.slice(0, 200) : null;

    await prisma.linkClick.create({
      data: { context, contextId, linkType, contextName },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("link-click error:", error);
    // Don't surface errors to the beacon — return ok so navigation is unaffected.
    return NextResponse.json({ ok: false });
  }
}
