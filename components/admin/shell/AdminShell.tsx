"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import Breadcrumbs from "./Breadcrumbs";
import SectionTabs from "./SectionTabs";
import AdminUserMenu from "./AdminUserMenu";
import CommandPalette from "./CommandPalette";
import AdminReminders from "@/components/admin/AdminReminders";

/**
 * Persistent admin shell: a fixed left sidebar on desktop, a slide-out drawer on
 * mobile, and a sticky top bar with a hamburger + breadcrumbs. Wraps every page
 * under /admin via app/admin/layout.tsx, so pages render only their own content.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop sidebar collapse (icon rail), remembered across sessions. Read after
  // mount so SSR/first paint stay deterministic (no hydration mismatch).
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("admin-sidebar-collapsed") === "1"); } catch {}
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Safety net for a Radix quirk: a dialog/dropdown that unmounts mid-navigation
  // (e.g. deleting a release redirects to the list) can leave
  // <body style="pointer-events:none"> behind, freezing the entire admin —
  // sidebar included — until a manual refresh. Clearing it on every route change
  // guarantees the UI can never get stuck. The rAF handles the common case
  // instantly; the timeout covers a dialog whose exit-animation cleanup re-locks
  // the body just after navigation.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const unlock = () => {
      document.body.style.pointerEvents = "";
    };
    const raf = requestAnimationFrame(unlock);
    const timer = setTimeout(unlock, 500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <div
      className="flex min-h-screen bg-[#0a0a0c] text-foreground"
      style={{
        // Admin-only surface elevation: the base theme sets --card == --background
        // (everything reads as one flat black). Lift cards/popovers off the darker
        // ground so panels, rows and menus have real separation.
        ["--card" as string]: "#161619",
        ["--popover" as string]: "#161619",
      }}
    >
      {/* Desktop sidebar */}
      <aside className={`hidden shrink-0 border-r border-border bg-sidebar transition-[width] duration-200 md:block ${collapsed ? "w-16" : "w-64"}`}>
        <div className="sticky top-0 h-screen">
          <AdminSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-xl transition-transform duration-300 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-label="Admin navigation"
        >
          <div className="flex shrink-0 justify-end p-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-background/70 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 md:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Suspense boundary: Breadcrumbs reads useSearchParams (for the ISNI
              guide's artist context), which requires one to avoid a CSR bailout. */}
          <Suspense fallback={null}>
            <Breadcrumbs />
          </Suspense>
          <div className="ml-auto flex items-center gap-2 md:gap-4">
            <CommandPalette />
            <AdminReminders />
            <AdminUserMenu />
          </div>
        </header>

        {/* Sub-view tabs for the current section (Tasks → Board/Automations/…). */}
        <SectionTabs />

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
