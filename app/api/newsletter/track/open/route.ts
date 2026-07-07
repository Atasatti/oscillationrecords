import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// GET /api/newsletter/track/open?c=<campaignId> — open-tracking pixel embedded in
// sent newsletters. Public (email clients have no session). Best-effort: a bad id
// or a DB hiccup never fails the image.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("c") || "";
  if (/^[a-f\d]{24}$/i.test(id)) {
    try {
      // updateMany (not update) so a stale/unknown id matches 0 rows, not throws.
      // Scoped to sent campaigns so the public pixel can't write against drafts.
      await prisma.campaign.updateMany({ where: { id, status: "sent" }, data: { opens: { increment: 1 } } });
    } catch {
      // ignore — tracking must never break the pixel
    }
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Length": String(PIXEL.length),
    },
  });
}
