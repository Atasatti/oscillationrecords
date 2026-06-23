import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWriteRetry } from "@/lib/db-retry";
import { requireAdmin } from "@/lib/auth-guard";
import { getFeaturedArtists } from "@/lib/admin-data";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — featured artists in home-carousel order.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const items = await getFeaturedArtists();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error loading home order:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

// PUT — { orderedIds: string[] } sets homeOrder = index for the featured set.
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
    // Sequential single-document updates — a multi-document $transaction here
    // deadlocks on MongoDB ("write conflict"). Order isn't atomicity-critical.
    for (let index = 0; index < orderedIds.length; index++) {
      await withWriteRetry(() =>
        prisma.artist.update({
          where: { id: orderedIds[index] },
          data: { homeOrder: index },
        })
      );
    }
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving home order:", error);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }
}
