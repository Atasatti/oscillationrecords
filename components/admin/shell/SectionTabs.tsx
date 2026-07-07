"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
    { label: "Automations", href: "/admin/automations", perm: "outreach:write" },
    { label: "Templates", href: "/admin/outreach/templates", perm: "outreach:write" },
  ],
  [
    { label: "Releases", href: "/admin/catalog/releases", perm: "catalog:read" },
    { label: "Pipeline", href: "/admin/catalog/pipeline", perm: "catalog:read" },
    { label: "Timeline", href: "/admin/catalog/timeline", perm: "catalog:read" },
  ],
  [
    { label: "Artists", href: "/admin/catalog/artists", perm: "catalog:read" },
    { label: "Onboarding", href: "/admin/catalog/artists/onboarding", perm: "catalog:read" },
  ],
  [
    { label: "Budgets", href: "/admin/catalog/budgets", perm: "catalog:read" },
  ],
  [
    { label: "Newsletter", href: "/admin/outreach/newsletter", perm: "outreach:read" },
    { label: "Subscribers", href: "/admin/subscribers", perm: "outreach:read" },
  ],
];

const isUnder = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export default function SectionTabs() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const isOwner = !!user?.isAdmin;
  const role = user?.role;
  const canSee = (perm?: Permission) => (!perm ? true : isOwner || roleCan(role, perm));

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
