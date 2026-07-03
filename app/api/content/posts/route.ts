import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeContentPostInput } from "@/lib/content-post";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function releaseExists(id: string): Promise<boolean> {
  const rel = await prisma.release.findUnique({ where: { id }, select: { id: true } });
  return !!rel;
}

// GET /api/content/posts — every planned post, soonest first.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const posts = await prisma.contentPost.findMany({ orderBy: { scheduledFor: "asc" } });
    return NextResponse.json({ posts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("content posts GET error:", e);
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }
}

// POST /api/content/posts — plan a post.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const input = normalizeContentPostInput(body);
    if (!input) {
      return NextResponse.json({ error: "A title and a valid date are required" }, { status: 400 });
    }
    // Drop a release link that doesn't resolve (deleted/foreign id) — the field
    // is display-only, so store null rather than a dangling reference.
    if (input.releaseId && !(await releaseExists(input.releaseId))) input.releaseId = null;

    const post = await prisma.contentPost.create({ data: input });
    await recordAudit(request, guard.token, {
      action: "create",
      resource: "content_post",
      resourceId: post.id,
      summary: `Planned "${post.title}" (${post.platform})`,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (e) {
    console.error("content posts POST error:", e);
    return NextResponse.json({ error: "Failed to plan post" }, { status: 500 });
  }
}
