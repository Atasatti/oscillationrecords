"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutDashboard, Users, Disc3, Settings, Activity, Mail, LogOut, User, ExternalLink, TriangleAlert, LayoutTemplate, Newspaper } from "lucide-react";
import { signOutCompletely } from "@/lib/sign-out-client";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";

// `match` lists extra path prefixes that should also activate a link. The
// release/artist detail + legacy-edit pages live on sibling paths (singular
// `release`, `artist`, and `edit/...`) that would otherwise fall through to
// "Site content" — keep them under their primary nav item instead.
const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/admin/catalog/releases",
    label: "Releases",
    icon: Disc3,
    match: ["/admin/catalog/release", "/admin/catalog/edit/release"],
  },
  {
    href: "/admin/catalog/artists",
    label: "Artists",
    icon: Users,
    match: ["/admin/catalog/artist", "/admin/catalog/edit/artist"],
  },
  { href: "/admin/catalog/press", label: "Press", icon: Newspaper },
  { href: "/admin/catalog", label: "Site content", icon: LayoutTemplate },
  { href: "/admin/subscribers", label: "Subscribers", icon: Mail },
  { href: "/admin/errors", label: "Errors", icon: TriangleAlert },
  { href: "/admin/data", label: "Live data", icon: Activity },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

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
 * /admin/catalog/release/<id> highlights "Releases" rather than "Site content". */
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
export default function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const user = session?.user;
  const guard = useUnsavedChangesContext();

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
        className="flex items-center gap-2 px-5 py-5"
      >
        <Image width={36} height={36} className="h-9 w-9" alt="" src="/logo-icon.svg" />
        <Image width={96} height={28} className="h-7 w-auto" style={{ width: "auto" }} alt="Oscillation Records" src="/logo-name.svg" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {adminLinks.map((link) => {
          const active = isAdminLinkActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onLinkClick}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border p-3">
        {status === "loading" ? (
          <div className="h-10 animate-pulse rounded-lg bg-white/5" />
        ) : user ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-2 py-1">
              {user.image ? (
                <Image
                  src={user.image}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <User size={16} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name || "Admin"}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email || ""}</p>
              </div>
            </div>
            <Link
              href="/"
              onClick={onLinkClick}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Back to site
            </Link>
            <button
              type="button"
              onClick={() => {
                if (guard && !guard.confirmNavigation()) return;
                onNavigate?.();
                signOutCompletely("/");
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
