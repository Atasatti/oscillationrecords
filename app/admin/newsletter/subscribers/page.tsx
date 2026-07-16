import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-guard";
import AdminSubscribersClient from "./AdminSubscribersClient";

// Server component: fetch the first page of subscribers on the server so the
// rows ship in the initial HTML (no client hydrate-then-fetch waterfall). The
// client handles search/pagination/delete/export. Mirrors the default GET in
// /api/admin/newsletter/subscribers (newest first, page 1, 25 rows).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminSubscribersPage() {
  // Revocation-aware gate BEFORE reading subscriber PII — middleware is token-only
  // (see lib/page-guard), and this direct-read page would otherwise leak emails to
  // a demoted staffer's still-valid JWT. Matches the API's outreach:read.
  await requirePagePermission("outreach:read");

  let initialData: { items: { id: string; email: string; createdAt: string }[]; total: number } | null = null;
  try {
    const [rows, total] = await Promise.all([
      prisma.newsletterSubscriber.findMany({
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        select: { id: true, email: true, createdAt: true },
      }),
      prisma.newsletterSubscriber.count(),
    ]);
    initialData = {
      items: rows.map((r) => ({ id: r.id, email: r.email, createdAt: r.createdAt.toISOString() })),
      total,
    };
  } catch {
    // Fall back to client-side loading on a transient DB error.
  }
  return <AdminSubscribersClient initialData={initialData} />;
}
