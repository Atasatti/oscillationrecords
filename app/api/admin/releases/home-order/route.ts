import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getFeaturedReleases } from "@/lib/admin-data";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — featured releases in New Music carousel order.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const items = await getFeaturedReleases();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error loading release home order:", error);
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
    // deadlocks on MongoDB ("write conflict"). Order isn't security-critical, so
    // atomicity isn't required; sequential writes are reliable and conflict-free.
    for (let index = 0; index < orderedIds.length; index++) {
      await prisma.release.update({
        where: { id: orderedIds[index] },
        data: { homeOrder: index },
      });
    }
    revalidatePath("/");
    revalidatePath("/releases");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving release home order:", error);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }
}
