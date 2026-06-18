import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Escape a value for CSV: wrap in quotes (doubling internal quotes) and, when it
 * begins with a character a spreadsheet treats as a formula (= + - @, tab, CR),
 * prefix a single quote. Subscriber emails are public-supplied, so an address
 * like `=HYPERLINK(...)` must not execute when the admin opens the file.
 */
function csvCell(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const escaped = (needsFormulaGuard ? `'${value}` : value).replace(/"/g, '""');
  return `"${escaped}"`;
}

// GET /api/admin/subscribers?q=&page=&pageSize=  (JSON list)
//     /api/admin/subscribers?format=csv          (CSV download of all matches)
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const where = q ? { email: { contains: q, mode: "insensitive" as const } } : {};

  if (searchParams.get("format") === "csv") {
    const all = await prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { email: true, createdAt: true },
    });
    const rows = [
      "email,subscribed_at",
      ...all.map((s) => `${csvCell(s.email)},${csvCell(s.createdAt.toISOString())}`),
    ].join("\r\n");
    return new NextResponse(rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers.csv"`,
      },
    });
  }

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));
  const [items, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, email: true, createdAt: true },
    }),
    prisma.newsletterSubscriber.count({ where }),
  ]);
  return NextResponse.json({ items, total });
}

// DELETE /api/admin/subscribers?id=...  (GDPR: remove a subscriber)
export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await prisma.newsletterSubscriber.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
