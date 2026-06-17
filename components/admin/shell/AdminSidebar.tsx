"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutDashboard, Users, Disc3, Home, Settings, Activity, Mail, LogOut, User, ExternalLink } from "lucide-react";
import { signOutCompletely } from "@/lib/sign-out-client";

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/data", label: "Live data", icon: Activity },
  { href: "/admin/catalog/releases", label: "Releases", icon: Disc3 },
  { href: "/admin/catalog/artists", label: "Artists", icon: Users },
  { href: "/admin/catalog", label: "Homepage", icon: Home },
  { href: "/admin/subscribers", label: "Subscribers", icon: Mail },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

const matches = (pathname: string, href: string) =>
  href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(href + "/");

/** The active link is the one whose href is the longest matching prefix, so
 * /admin/catalog/artists highlights "Artists" rather than also "Catalog". */
function activeHrefFor(pathname: string): string | undefined {
  return adminLinks
    .map((l) => l.href)
    .filter((h) => matches(pathname, h))
    .sort((a, b) => b.length - a.length)[0];
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

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex items-center gap-2 px-5 py-5"
      >
        <Image width={36} height={36} className="h-9 w-9" alt="" src="/logo-icon.svg" />
        <Image width={96} height={28} className="h-7 w-auto" alt="Oscillation Records" src="/logo-name.svg" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {adminLinks.map((link) => {
          const active = isAdminLinkActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
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
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Back to site
            </Link>
            <button
              type="button"
              onClick={() => {
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
