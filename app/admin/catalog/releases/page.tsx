import { getReleasesPage } from "@/lib/admin-data";
import AdminReleasesClient from "./AdminReleasesClient";

// Server component: fetch the first page (for the requested status tab) on the
// server so the rows ship in the initial HTML — no client hydrate-then-fetch
// waterfall. The /admin area is middleware-gated, so this only runs for admins.
// The client takes over for filtering/sorting/pagination. force-dynamic: always
// fresh admin data.
export const dynamic = "force-dynamic";

export default async function AdminReleasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const s = (sp.status || "").toUpperCase();
  const status =
    s === "DRAFT" || s === "SCHEDULED" || s === "RELEASED"
      ? (s as "DRAFT" | "SCHEDULED" | "RELEASED")
      : undefined;

  let initialData: { items: Awaited<ReturnType<typeof getReleasesPage>>["items"]; total: number } | null = null;
  try {
    const page = await getReleasesPage({ page: 1, pageSize: 25, sort: "sortOrder", dir: "asc", status });
    initialData = { items: page.items, total: page.total };
  } catch {
    // Fall back to client-side loading on a transient DB error.
  }
  return <AdminReleasesClient initialData={initialData} />;
}
