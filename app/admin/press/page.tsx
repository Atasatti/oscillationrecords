import { getPressPage } from "@/lib/admin-data";
import AdminPressClient from "./AdminPressClient";

// Server component: fetch the first page on the server so the rows ship in the
// initial HTML (no client hydrate-then-fetch waterfall). Middleware gates /admin,
// so this only runs for admins; the client handles search/pagination.
export const dynamic = "force-dynamic";

export default async function AdminPressPage() {
  let initialData: { items: Awaited<ReturnType<typeof getPressPage>>["items"]; total: number } | null = null;
  try {
    const page = await getPressPage({ page: 1, pageSize: 25 });
    initialData = { items: page.items, total: page.total };
  } catch {
    // Fall back to client-side loading on a transient DB error.
  }
  return <AdminPressClient initialData={initialData} />;
}
