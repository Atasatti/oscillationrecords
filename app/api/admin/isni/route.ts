import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { searchIsni } from "@/lib/isni";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/isni?q=<name> — admin-only ISNI lookup by name (public OCLC
// SRU API, free, no key). Returns { matches: IsniMatch[] } for the editor to
// pick from. Best-effort: returns [] rather than erroring.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const q = new URL(request.url).searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ matches: [] });

  const matches = await searchIsni(q);
  return NextResponse.json({ matches });
}
