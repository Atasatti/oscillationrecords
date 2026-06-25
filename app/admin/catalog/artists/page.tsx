import { getArtistsPage, getDistinctGenres } from "@/lib/admin-data";
import AdminArtistsClient from "./AdminArtistsClient";

// Server component: fetch the default first page + genre list on the server so
// they ship in the initial HTML (no client hydrate-then-fetch waterfall). The
// /admin area is gated by middleware, so this only runs for admins. The client
// component takes over for filtering/sorting/pagination. force-dynamic since
// this is always-fresh admin data.
export const dynamic = "force-dynamic";

export default async function AdminArtistsPage() {
  let initialData: { items: Awaited<ReturnType<typeof getArtistsPage>>["items"]; total: number } | null = null;
  let initialGenres: string[] = [];
  try {
    const [page, genres] = await Promise.all([
      getArtistsPage({
        page: 1,
        pageSize: 25,
        sort: "sortOrder",
        dir: "asc",
        filters: { visibility: "all", featured: "all", genre: "" },
      }),
      getDistinctGenres(),
    ]);
    initialData = { items: page.items, total: page.total };
    initialGenres = genres;
  } catch {
    // Fall back to client-side loading (the component fetches when initialData
    // is null) rather than failing the whole route on a transient DB hiccup.
  }
  return <AdminArtistsClient initialData={initialData} initialGenres={initialGenres} />;
}
