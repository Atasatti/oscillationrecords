import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PUT — { orderedIds: string[] } sets comingSoonOrder = index over the SCHEDULED
// (Coming Soon) releases, controlling their order in the home "Coming Soon"
// section. Uses its own field (not sortOrder) so it never collides with the
// Custom-order panel, which writes sortOrder over all releases.
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json();
    const orderedIds: string[] = Array.isArray(body.orderedIds)
      ? body.orderedIds.filter((id: unknown) => typeof id === "string")
      : [];
    if (orderedIds.length === 0) {
      return NextResponse.json({ error: "orderedIds required" }, { status: 400 });
    }
    // Sequential updates — a multi-document $transaction deadlocks on MongoDB.
    for (let index = 0; index < orderedIds.length; index++) {
      await prisma.release.update({
        where: { id: orderedIds[index] },
        data: { comingSoonOrder: index },
      });
    }
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving coming-soon order:", error);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }
}
