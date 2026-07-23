"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { LogOut, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import StaffAvatar from "@/components/admin/StaffAvatar";
import { signOutCompletely } from "@/lib/sign-out-client";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";

/**
 * Account menu for the admin topbar (top-right), mirroring the public site's
 * navbar dropdown. Replaces the old sidebar footer: avatar → name/email, Back to
 * site, Sign out. Respects the unsaved-changes guard on navigation away.
 */
export default function AdminUserMenu() {
  const { data: session, status } = useSession();
  const guard = useUnsavedChangesContext();
  const user = session?.user;

  if (status === "loading") return <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />;
  if (!user) return null;

  const confirmNav = () => !guard || guard.confirmNavigation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className="shrink-0 overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {/* StaffAvatar carries the no-referrer + onError-fallback treatment for
              Google avatar URLs (and skips the image optimizer, whose
              server-side fetch is what Google rate-limits in production). */}
          <StaffAvatar name={user.name} email={user.email} image={user.image} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name || "Admin"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email || ""}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/" onClick={(e) => { if (!confirmNav()) e.preventDefault(); }}>
            <ExternalLink className="mr-2 h-4 w-4" />
            <span>Back to site</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => { if (confirmNav()) signOutCompletely("/"); }}
          className="cursor-pointer text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
