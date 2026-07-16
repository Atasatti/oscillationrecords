"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutDashboard, Users, Disc3, Settings, Activity, MessageSquare, TriangleAlert, LayoutTemplate, Newspaper, Target, ListChecks, FolderArchive, ScrollText, CalendarDays, Wallet, Send, Mailbox, ChevronsLeft, ChevronsRight, type LucideIcon } from "lucide-react";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";
import { roleCan, type Permission } from "@/lib/permissions";

// `match` lists extra path prefixes that should also activate a link. The
// release/artist detail + legacy-edit pages live on sibling paths (singular
// `release`, `artist`, and `edit/...`) that would otherwise fall through to
// "Site content" — keep them under their primary nav item instead.
//
// Links are organised into labelled groups (rendered with a small header in the
// sidebar). The first group has no header — Dashboard sits on its own up top.
// `perm` gates a link by the signed-in staff role: a Permission ("catalog:read")
// requires that grant, "owner" is owner-only, and undefined means any staff role
// (e.g. the Dashboard). Owners always see everything. This is cosmetic — the hard
// enforcement is middleware page-gating + per-route API permission checks.
export type AdminLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: readonly string[];
  perm?: Permission | "owner";
};
type AdminGroup = { header: string | null; links: readonly AdminLink[] };
// The sidebar shows only PRIMARY sections; sub-views (Pipeline/Timeline under
// Releases, Automations/Templates under Tasks, Onboarding under Artists, Budgets
// under Money, Subscribers under Newsletter) are reached via the in-page tab
// strip (components/admin/shell/SectionTabs.tsx). Each primary link's `match`
// lists its sub-view routes so the parent stays highlighted on those pages.
export const adminGroups: readonly AdminGroup[] = [
  {
    header: null,
    links: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    header: "Catalog",
    links: [
      {
        href: "/admin/releases",
        label: "Releases",
        icon: Disc3,
        match: ["/admin/release", "/admin/edit/release", "/admin/pipeline", "/admin/timeline"],
        perm: "catalog:read",
      },
      {
        href: "/admin/artists",
        label: "Artists",
        icon: Users,
        match: ["/admin/artist", "/admin/edit/artist"],
        perm: "catalog:read",
      },
      { href: "/admin/press", label: "Press", icon: Newspaper, perm: "catalog:read" },
      { href: "/admin/assets", label: "Assets", icon: FolderArchive, perm: "catalog:read" },
      { href: "/admin/budgets", label: "Budgets", icon: Wallet, perm: "catalog:read" },
      { href: "/admin/site-content", label: "Site content", icon: LayoutTemplate, perm: "catalog:read" },
    ],
  },
  {
    header: "Promotion",
    links: [
      { href: "/admin/outreach", label: "Outreach", icon: Target, match: ["/admin/outreach/contacts", "/admin/outreach/pitches", "/admin/outreach/demos", "/admin/outreach/placements"], perm: "outreach:read" },
      { href: "/admin/tasks", label: "Tasks", icon: ListChecks, match: ["/admin/tasks/automations", "/admin/tasks/templates"], perm: "outreach:read" },
      { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, perm: "outreach:read" },
      { href: "/admin/newsletter", label: "Newsletter", icon: Send, match: ["/admin/newsletter/subscribers"], perm: "outreach:read" },
      { href: "/admin/messages", label: "Messages", icon: MessageSquare, perm: "outreach:read" },
    ],
  },
  {
    header: "Insights",
    links: [
      { href: "/admin/data", label: "Live data", icon: Activity, perm: "analytics:read" },
      { href: "/admin/errors", label: "Errors", icon: TriangleAlert, perm: "analytics:read" },
      { href: "/admin/digest", label: "Daily digest", icon: Mailbox },
    ],
  },
  {
    header: "System",
    links: [
      { href: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "owner" },
      { href: "/admin/settings", label: "Settings", icon: Settings, perm: "owner" },
    ],
  },
];

const adminLinks = adminGroups.flatMap((g) => g.links);

const prefixMatches = (pathname: string, prefix: string) =>
  prefix === "/admin"
    ? pathname === "/admin"
    : pathname === prefix || pathname.startsWith(prefix + "/");

/** Every path prefix that should light up a link: its href plus any aliases. */
const linkPrefixes = (link: (typeof adminLinks)[number]): readonly string[] => [
  link.href,
  ...((link as { match?: readonly string[] }).match ?? []),
];

/** The active link is the one with the longest matching prefix, so
 * /admin/release/<id> highlights "Releases" rather than "Site content". */
function activeHrefFor(pathname: string): string | undefined {
  let best: { href: string; len: number } | undefined;
  for (const link of adminLinks) {
    for (const prefix of linkPrefixes(link)) {
      if (prefixMatches(pathname, prefix) && (!best || prefix.length > best.len)) {
        best = { href: link.href, len: prefix.length };
      }
    }
  }
  return best?.href;
}

export const isAdminLinkActive = (pathname: string, href: string) =>
  activeHrefFor(pathname) === href;

/**
 * Sidebar contents — used both in the persistent desktop rail and inside the
 * mobile drawer (AdminShell). `onNavigate` lets the drawer close on link click.
 */
export default function AdminSidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const guard = useUnsavedChangesContext();

  // Filter the nav by the signed-in staff role. Owners see everything; scoped
  // roles see only the sections they can read. Groups left with no visible links
  // are dropped. (Cosmetic — middleware + the API enforce access for real.)
  const isOwner = !!user?.isAdmin;
  const role = user?.role;
  const canSee = (perm?: Permission | "owner") =>
    !perm ? true : perm === "owner" ? isOwner : isOwner || roleCan(role, perm);
  const visibleGroups = adminGroups
    .map((g) => ({ ...g, links: g.links.filter((l) => canSee(l.perm)) }))
    .filter((g) => g.links.length > 0);

  // Gate client-side navigation away from an editor with unsaved changes.
  // For <Link>, cancelling preventDefault stops Next's client navigation.
  const onLinkClick = (e: React.MouseEvent) => {
    if (guard && !guard.confirmNavigation()) {
      e.preventDefault();
      return;
    }
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/admin"
        onClick={onLinkClick}
        className={`flex items-center py-5 ${collapsed ? "justify-center px-2" : "gap-2 px-5"}`}
      >
        <Image width={36} height={36} className="h-9 w-9 shrink-0" alt="" src="/logo-icon.svg" />
        {!collapsed ? (
          <Image width={96} height={28} className="h-7 w-auto" style={{ width: "auto" }} alt="Oscillation Records" src="/logo-name.svg" />
        ) : null}
      </Link>

      <nav className={`scroll-themed flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2 ${collapsed ? "px-2" : "px-3"}`}>
        {visibleGroups.map((group, gi) => (
          <div key={group.header ?? "main"} className={gi > 0 ? (collapsed ? "mt-2" : "mt-4") : undefined}>
            {group.header && !collapsed ? (
              <p className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.header}
              </p>
            ) : null}
            {/* Collapsed: a thin rule keeps groups visually separated (headers hidden). */}
            {group.header && collapsed && gi > 0 ? (
              <div className="mx-2 mb-1 border-t border-border/60" aria-hidden />
            ) : null}
            <div className="flex flex-col gap-1">
              {group.links.map((link) => {
                const active = isAdminLinkActive(pathname, link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onLinkClick}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? link.label : undefined}
                    className={`flex items-center rounded-lg py-2.5 text-sm transition-colors ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {!collapsed ? link.label : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {onToggleCollapse ? (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex w-full items-center rounded-lg py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4 shrink-0" aria-hidden />
                Collapse
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
