import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { extractPressInput } from "@/lib/press-input";
import { rehostExternalImage } from "@/lib/s3";
import { getAllPress, getPressForArtist, getPressForRelease } from "@/lib/catalog-data";
import { getPressPage } from "@/lib/admin-data";

// AWS SDK + getToken need the Node runtime; never statically cache.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/press
// Default (public): bare array of live press items (resolves only public
// artists/releases). With `?page=`/`?pageSize=` (admin): the paginated
// `{items,total,page,pageSize}` envelope including hidden items.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.has("page") || searchParams.has("pageSize")) {
      const guard = await requireAdmin(request);
      if (!guard.ok) return guard.response;
      const page = parseInt(searchParams.get("page") || "1", 10) || 1;
      const pageSize = parseInt(searchParams.get("pageSize") || "25", 10) || 25;
      const result = await getPressPage({
        page,
        pageSize,
        q: searchParams.get("q") || "",
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const releaseId = searchParams.get("releaseId");
    const artistId = searchParams.get("artistId");
    const items = releaseId
      ? await getPressForRelease(releaseId)
      : artistId
        ? await getPressForArtist(artistId)
        : await getAllPress();
    return NextResponse.json(items, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching press:", error);
    return NextResponse.json({ error: "Failed to fetch press" }, { status: 500 });
  }
}

// POST /api/press — create a press item (admin only).
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const input = extractPressInput(body);
    if (!input) {
      return NextResponse.json(
        { error: "title, publisher, summary and a valid article URL are required" },
        { status: 400 }
      );
    }

    // Validate every linked artist/release actually exists before writing.
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

    // Prepend new coverage: one below the current minimum order.
    const agg = await prisma.pressItem.aggregate({ _min: { sortOrder: true } });
    const sortOrder = (agg._min.sortOrder ?? 0) - 1;

    // Rehost the article's OG image onto our S3 so it's ours and won't break on
    // hotlink protection; best-effort, keeps the original URL if the copy fails.
    const finalImage = input.image
      ? (await rehostExternalImage(input.image, input.title, "press/images")) ?? input.image
      : null;

    const press = await prisma.pressItem.create({
      data: {
        title: input.title,
        publisher: input.publisher,
        articleUrl: input.articleUrl,
        summary: input.summary,
        image: finalImage,
        author: input.author,
        publishedAt: input.publishedAt,
        artistIds: input.artistIds,
        releaseIds: input.releaseIds,
        sortOrder,
        showOnWebsite: true,
      },
    });

    return NextResponse.json(press, { status: 201 });
  } catch (error) {
    console.error("Error creating press item:", error);
    return NextResponse.json({ error: "Failed to create press item" }, { status: 500 });
  }
}
