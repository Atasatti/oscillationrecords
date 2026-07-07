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
type Tab = { label: string; href: string; perm?: Permission };

const TAB_GROUPS: readonly (readonly Tab[])[] = [
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
    { label: "Royalties", href: "/admin/catalog/royalties", perm: "catalog:read" },
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

  // The group that owns this route: any of its tabs is a prefix of the path.
  // Artists must be checked so /admin/catalog/artists/onboarding resolves to the
  // Artists group (Releases tabs don't match that path, so there's no clash).
  const group = TAB_GROUPS.find((g) => g.some((t) => isUnder(pathname, t.href)));
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
      <nav className="flex flex-wrap gap-x-1 overflow-x-auto px-4 md:px-8" aria-label="Section">
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
