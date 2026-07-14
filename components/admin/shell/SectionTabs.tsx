"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { MouseEvent } from "react";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";
import { roleCan, type Permission } from "@/lib/permissions";

/**
 * In-page tab strip for a primary section's sub-views. Rendered once in the admin
 * shell (below the topbar) and driven entirely by the current route: it finds the
 * group that owns the path and shows that group's tabs, so no individual page has
 * to wire it up. Tabs are permission-filtered like the sidebar; a lone remaining
 * tab renders nothing (no chrome for a single view).
 */
export type Tab = { label: string; href: string; perm?: Permission };

export const TAB_GROUPS: readonly (readonly Tab[])[] = [
  [
    { label: "Overview", href: "/admin/outreach", perm: "outreach:read" },
    { label: "Contacts", href: "/admin/outreach/contacts", perm: "outreach:read" },
    { label: "Pitches", href: "/admin/outreach/pitches", perm: "outreach:read" },
    { label: "Demos", href: "/admin/outreach/demos", perm: "outreach:read" },
    { label: "Placements", href: "/admin/outreach/placements", perm: "outreach:read" },
  ],
  [
    { label: "Board", href: "/admin/tasks" },
    { label: "Automations", href: "/admin/tasks/automations", perm: "outreach:write" },
    { label: "Templates", href: "/admin/tasks/templates", perm: "outreach:write" },
  ],
  [
    { label: "Releases", href: "/admin/releases", perm: "catalog:read" },
    { label: "Pipeline", href: "/admin/pipeline", perm: "catalog:read" },
    { label: "Timeline", href: "/admin/timeline", perm: "catalog:read" },
  ],
  [
    { label: "Artists", href: "/admin/artists", perm: "catalog:read" },
    { label: "Onboarding", href: "/admin/artists/onboarding", perm: "catalog:read" },
  ],
  [
    { label: "Budgets", href: "/admin/budgets", perm: "catalog:read" },
  ],
  [
    { label: "Newsletter", href: "/admin/newsletter", perm: "outreach:read" },
    { label: "Subscribers", href: "/admin/newsletter/subscribers", perm: "outreach:read" },
  ],
];

const isUnder = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export default function SectionTabs() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const guard = useUnsavedChangesContext();
  const user = session?.user;
  const isOwner = !!user?.isAdmin;
  const role = user?.role;
  const canSee = (perm?: Permission) => (!perm ? true : isOwner || roleCan(role, perm));

  // Hide the section tabs on any individual item's create / edit / detail / sub-
  // editor page (release, artist, contact, …). Section-level tabs belong to the
  // list/overview, not inside a single record — there they're noise and add a nav
  // path away from unsaved work; the ways out are the guarded sidebar, breadcrumbs
  // and the editor's own Save/Cancel. List and sub-view pages (Artists, Onboarding,
  // Pipeline, Timeline, Subscribers …) still show them.
  const onItemPage =
    pathname.endsWith("/new") ||
    pathname.endsWith("/edit") ||
    pathname.endsWith("/tracks") ||
    // singular detail/VIEW routes: /admin/release/<id>, /admin/artist/<id>
    /^\/admin\/(release|artist)\/[0-9a-f]{24}(\/|$)/i.test(pathname);
  if (onItemPage) return null;

  // Guard tab navigation exactly like the sidebar + breadcrumbs do — otherwise a
  // tab click silently discards an editor's unsaved changes. SectionTabs was the
  // one nav surface missing this, which made the discard prompt inconsistent.
  const onLinkClick = (e: MouseEvent) => {
    if (guard && !guard.confirmNavigation()) e.preventDefault();
  };

  // The owning group = the one containing the tab with the LONGEST matching
  // prefix. Longest-prefix (not first-match) matters because /admin/outreach is a
  // prefix of other sections' routes (newsletter, templates) — those must resolve
  // to their own group, not to Outreach's Overview tab.
  let group: readonly Tab[] | null = null;
  let bestLen = -1;
  for (const g of TAB_GROUPS) {
    for (const t of g) {
      if (isUnder(pathname, t.href) && t.href.length > bestLen) { bestLen = t.href.length; group = g; }
    }
  }
  if (!group) return null;

  const tabs = group.filter((t) => canSee(t.perm));
  if (tabs.length < 2) return null;

  // Active = the visible tab with the longest matching href prefix.
  let activeHref = "";
  for (const t of tabs) {
    if (isUnder(pathname, t.href) && t.href.length > activeHref.length) activeHref = t.href;
  }

  return (
    <div className="border-b border-border bg-background/40">
      <nav className="flex flex-wrap gap-x-1 px-4 md:px-8" aria-label="Section">
        {tabs.map((t) => {
          const active = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              onClick={onLinkClick}
              aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-white text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
