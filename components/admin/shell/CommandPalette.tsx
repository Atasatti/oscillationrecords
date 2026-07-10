"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Disc3, UserRound } from "lucide-react";
import { adminGroups } from "./AdminSidebar";
import { TAB_GROUPS } from "./SectionTabs";
import { roleCan, type Permission } from "@/lib/permissions";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";

// Flattened, deduped nav destinations (sidebar sections + in-page tab sub-views),
// computed once. Permission is applied per-viewer at render.
type Dest = { label: string; href: string; perm?: Permission | "owner"; group: string };
const ALL_DESTINATIONS: Dest[] = (() => {
  const seen = new Set<string>();
  const out: Dest[] = [];
  for (const g of adminGroups) for (const l of g.links) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    out.push({ label: l.label, href: l.href, perm: l.perm, group: g.header ?? "" });
  }
  for (const grp of TAB_GROUPS) for (const t of grp) {
    if (seen.has(t.href)) continue;
    seen.add(t.href);
    out.push({ label: t.label, href: t.href, perm: t.perm, group: "Views" });
  }
  return out;
})();

// "g then <key>" quick jumps (fire only when not typing and the palette is shut).
const G_SHORTCUTS: Record<string, string> = {
  d: "/admin",
  t: "/admin/tasks",
  r: "/admin/catalog/releases",
  a: "/admin/catalog/artists",
  m: "/admin/messages",
};

type Item = { kind: "nav" | "release" | "artist"; label: string; sub: string; href: string };
type SearchData = { releases: { id: string; name: string }[]; artists: { id: string; name: string }[] };

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const guard = useUnsavedChangesContext();
  const isOwner = !!session?.user?.isAdmin;
  const role = session?.user?.role;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [data, setData] = useState<SearchData | null>(null);
  const gAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const canSee = useCallback(
    (perm?: Permission | "owner") => (!perm ? true : perm === "owner" ? isOwner : isOwner || roleCan(role, perm)),
    [isOwner, role]
  );

  // Lazy-load release/artist names the first time the palette opens.
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    fetch("/api/admin/nav-search")
      .then((r) => (r.ok ? r.json() : { releases: [], artists: [] }))
      .then((j) => { if (!cancelled) setData({ releases: j.releases ?? [], artists: j.artists ?? [] }); })
      .catch(() => { if (!cancelled) setData({ releases: [], artists: [] }); });
    return () => { cancelled = true; };
  }, [open, data]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const nav = ALL_DESTINATIONS.filter((d) => canSee(d.perm) && (!q || d.label.toLowerCase().includes(q)))
      .slice(0, q ? 8 : 60)
      .map<Item>((d) => ({ kind: "nav", label: d.label, sub: d.group || "Go to", href: d.href }));
    if (!q || !data) return nav;
    const rel = data.releases.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 6)
      .map<Item>((r) => ({ kind: "release", label: r.name, sub: "Release", href: `/admin/catalog/releases/${r.id}/edit` }));
    const art = data.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 6)
      .map<Item>((a) => ({ kind: "artist", label: a.name, sub: "Artist", href: `/admin/catalog/artists/${a.id}/edit` }));
    return [...nav, ...rel, ...art];
  }, [query, data, canSee]);

  useEffect(() => { setActive(0); }, [query]);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  const go = useCallback((href: string) => {
    if (guard && !guard.confirmNavigation()) return;
    close();
    router.push(href);
  }, [guard, close, router]);

  // Close on any route change so navigation from ANY source — the palette itself,
  // a sidebar link, a "g" shortcut, or the browser back/forward buttons — never
  // leaves the modal (and its dimmed backdrop) stranded over the newly opened page.
  useEffect(() => { close(); }, [pathname, close]);

  // Global: ⌘/Ctrl-K toggles; "g then key" jumps when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (open || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const now = Date.now();
      if (e.key === "g") { gAt.current = now; return; }
      if (gAt.current && now - gAt.current < 900) {
        const href = G_SHORTCUTS[e.key.toLowerCase()];
        gAt.current = 0;
        if (href) {
          e.preventDefault();
          if (!guard || guard.confirmNavigation()) router.push(href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, guard, router]);

  // Focus the input when opening.
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  // Keep the active row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const it = items[active]; if (it) go(it.href); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  return (
    <>
      {/* Topbar trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search (Command K)"
        className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] text-muted-foreground/80 lg:inline">⌘K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Jump to a page, release or artist…"
                className="w-full bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</p>
              ) : (
                items.map((it, i) => (
                  <button
                    key={`${it.kind}-${it.href}`}
                    type="button"
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(it.href)}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                      i === active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {it.kind === "release" ? <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : it.kind === "artist" ? <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <span className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/70">{it.sub}</span>
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground/70">
              <span className="inline-flex items-center gap-1"><ArrowUp className="h-3 w-3" /><ArrowDown className="h-3 w-3" /> navigate</span>
              <span className="inline-flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> open</span>
              <span className="ml-auto hidden sm:inline">Tip: <kbd className="rounded border border-border px-1">g</kbd> then <kbd className="rounded border border-border px-1">t</kbd> · tasks, <kbd className="rounded border border-border px-1">r</kbd> · releases</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
