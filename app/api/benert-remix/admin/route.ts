import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { assetDownloadHref } from "@/lib/s3-url";
import { fileNameFromUrl } from "@/lib/asset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/benert-remix/admin - List all submissions (admin only)
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const entries = await prisma.benertRemixEntry.findMany({
      where: { uploadedFileUrl: { not: null } },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const rows = entries.map((entry) => ({
      id: entry.id,
      name: entry.user.name ?? "—",
      email: entry.user.email ?? "—",
      releaseName: entry.releaseName ?? "—",
      // Never the raw bucket URL: entries are private (audit #1), so the admin
      // gets a same-origin shim href that re-authorizes and presigns on click.
      musicFileUrl: entry.uploadedFileUrl
        ? assetDownloadHref(entry.uploadedFileUrl, fileNameFromUrl(entry.uploadedFileUrl))
        : null,
    }));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Benert remix admin list error:", error);
    return NextResponse.json(
      { error: "Failed to list entries" },
      { status: 500 }
    );
  }
}
