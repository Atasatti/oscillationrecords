import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { extractPressInput } from "@/lib/press-input";
import { rehostExternalImage } from "@/lib/s3";
import { submitToIndexNow } from "@/lib/indexnow";
import { slugify } from "@/lib/slug";
import { revalidateAdminCatalog } from "@/lib/admin-cache-tags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/press/[pressId] — full row for the admin editor (admin only).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pressId: string }> }
) {
  try {
    const guard = await requirePermission(request, "catalog:read");
    if (!guard.ok) return guard.response;

    const { pressId } = await params;
    const press = await prisma.pressItem.findUnique({ where: { id: pressId } });
    if (!press) {
      return NextResponse.json({ error: "Press item not found" }, { status: 404 });
    }
    return NextResponse.json(press);
  } catch (error) {
    console.error("Error fetching press item:", error);
    return NextResponse.json({ error: "Failed to fetch press item" }, { status: 500 });
  }
}

// PUT /api/press/[pressId] — full update from the editor (admin only).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pressId: string }> }
) {
  try {
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    const { pressId } = await params;
    const body = await request.json();
    const draft = body.draft === true;
    const input = extractPressInput(body, { draft });
    if (!input) {
      return NextResponse.json(
        {
          error: draft
            ? "A title is required (even for a draft)."
            : "A published item needs a title and summary, plus either a body (owned post) or a publisher and a valid article URL (external coverage).",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.pressItem.findUnique({ where: { id: pressId } });
    if (!existing) {
      return NextResponse.json({ error: "Press item not found" }, { status: 404 });
    }

    if (input.artistIds.length) {
      const found = await prisma.artist.findMany({
        where: { id: { in: input.artistIds } },
        select: { id: true },
      });
      if (found.length !== input.artistIds.length) {
        return NextResponse.json(
          { error: "One or more linked artists were not found" },
          { status: 400 }
        );
      }
    }
    if (input.releaseIds.length) {
      const found = await prisma.release.findMany({
        where: { id: { in: input.releaseIds } },
        select: { id: true },
      });
      if (found.length !== input.releaseIds.length) {
        return NextResponse.json(
          { error: "One or more linked releases were not found" },
          { status: 400 }
        );
      }
    }

    // Rehost only when the image changed (no-op if already on our bucket).
    const finalImage = input.image
      ? (await rehostExternalImage(input.image, input.title, "press/images")) ?? input.image
      : null;

    const press = await prisma.pressItem.update({
      where: { id: pressId },
      data: {
        title: input.title,
        publisher: input.publisher,
        articleUrl: input.articleUrl,
        summary: input.summary,
        body: input.body,
        image: finalImage,
        author: input.author,
        publishedAt: input.publishedAt,
        artistIds: input.artistIds,
        releaseIds: input.releaseIds,
        draft,
      },
    });

    revalidateAdminCatalog();

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "press",
      resourceId: press.id,
      summary: `Updated press "${press.title}"`,
    });

    // A published owned post has its own page — recrawl it (and the feed) on edit.
    if (!draft && input.body) {
      const slug = slugify(input.title);
      after(() => submitToIndexNow([`/press/${slug}`, "/press"]));
    }

    return NextResponse.json(press);
  } catch (error) {
    console.error("Error updating press item:", error);
    return NextResponse.json({ error: "Failed to update press item" }, { status: 500 });
  }
}

// PATCH /api/press/[pressId] — partial toggles: "Show on website" and/or
// "Featured". Newly featuring appends to the end of the featured order.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pressId: string }> }
) {
  try {
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    const { pressId } = await params;
    const body = await request.json();

    const data: { showOnWebsite?: boolean; featured?: boolean; homeOrder?: number } = {};
    if (typeof body.showOnWebsite === "boolean") data.showOnWebsite = body.showOnWebsite;
    if (typeof body.featured === "boolean") data.featured = body.featured;

    if (data.showOnWebsite === undefined && data.featured === undefined) {
      return NextResponse.json(
        { error: "Provide showOnWebsite and/or featured (boolean)" },
        { status: 400 }
      );
    }

    const existing = await prisma.pressItem.findUnique({ where: { id: pressId } });
    if (!existing) {
      return NextResponse.json({ error: "Press item not found" }, { status: 404 });
    }

    if (data.featured === true && !existing.featured) {
      const max = await prisma.pressItem.aggregate({
        where: { featured: true },
        _max: { homeOrder: true },
      });
      data.homeOrder = (max._max.homeOrder ?? -1) + 1;
    }

    const press = await prisma.pressItem.update({ where: { id: pressId }, data });
    revalidateAdminCatalog();
    return NextResponse.json(press);
  } catch (error) {
    console.error("Error updating press item:", error);
    return NextResponse.json({ error: "Failed to update press item" }, { status: 500 });
  }
}

// DELETE /api/press/[pressId] — admin only.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pressId: string }> }
) {
  try {
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    const { pressId } = await params;
    const existing = await prisma.pressItem.findUnique({
      where: { id: pressId },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Press item not found" }, { status: 404 });
    }

    await prisma.pressItem.delete({ where: { id: pressId } });
    revalidateAdminCatalog();
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "press",
      resourceId: pressId,
      summary: `Deleted press "${existing.title}"`,
    });
    return NextResponse.json({ message: "Press item deleted successfully" });
  } catch (error) {
    console.error("Error deleting press item:", error);
    return NextResponse.json({ error: "Failed to delete press item" }, { status: 500 });
  }
}
