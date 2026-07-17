"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Disc3, UserRound, Music } from "lucide-react";
import { adminGroups } from "./AdminSidebar";
import { TAB_GROUPS } from "./SectionTabs";
import { roleCan, type Permission } from "@/lib/permissions";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";
import { isObjectId } from "@/lib/object-id";

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
  r: "/admin/releases",
  a: "/admin/artists",
  m: "/admin/messages",
};

// `id` is the item's own unique identity (entity id, or href for nav). It keys the
// list — the href alone isn't unique: several tracks from one release all link to
// that release's tracklist, so keying on href collided ("two children with the
// same key"). The entity id never collides.
type Item = { kind: "nav" | "release" | "artist" | "track"; id: string; label: string; sub: string; href: string };
type TrackHit = { id: string; name: string; releaseId: string; releaseName: string | null };
type SearchData = {
  releases: { id: string; name: string }[];
  artists: { id: string; name: string }[];
  tracks: TrackHit[];
};

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
  // Shortcut hint glyph: ⌘K on Apple platforms, Ctrl+K elsewhere. Starts false so the
  // server render and first client paint agree, then a mount effect corrects it
  // (navigator is client-only) — no hydration mismatch. The key handler below already
  // accepts both Cmd and Ctrl; this only drives the visible / accessible label.
  const [isMac, setIsMac] = useState(false);
  const gAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const canSee = useCallback(
    (perm?: Permission | "owner") => (!perm ? true : perm === "owner" ? isOwner : isOwner || roleCan(role, perm)),
    [isOwner, role]
  );

  // Lazy-load release/artist names the first time the palette opens.
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    fetch("/api/admin/nav-search")
      .then((r) => (r.ok ? r.json() : { releases: [], artists: [], tracks: [] }))
      .then((j) => { if (!cancelled) setData({ releases: j.releases ?? [], artists: j.artists ?? [], tracks: j.tracks ?? [] }); })
      .catch(() => { if (!cancelled) setData({ releases: [], artists: [], tracks: [] }); });
    return () => { cancelled = true; };
  }, [open, data]);

  // Detect Apple platforms once, client-side, to choose the shortcut glyph.
  useEffect(() => {
    const n = window.navigator;
    setIsMac(/Mac|iPhone|iPod|iPad/i.test(n.platform || "") || /Mac OS X/i.test(n.userAgent || ""));
  }, []);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const nav = ALL_DESTINATIONS.filter((d) => canSee(d.perm) && (!q || d.label.toLowerCase().includes(q)))
      .slice(0, q ? 8 : 60)
      .map<Item>((d) => ({ kind: "nav", id: d.href, label: d.label, sub: d.group || "Go to", href: d.href }));
    if (!q || !data) return nav;
    // Guard every entity id before it becomes part of a jump URL — a hit with a
    // missing/invalid id would route to a dead page like `/admin/releases/null/edit`.
    const rel = data.releases.filter((r) => isObjectId(r.id) && r.name.toLowerCase().includes(q)).slice(0, 6)
      .map<Item>((r) => ({ kind: "release", id: r.id, label: r.name, sub: "Release", href: `/admin/releases/${r.id}/edit` }));
    const art = data.artists.filter((a) => isObjectId(a.id) && a.name.toLowerCase().includes(q)).slice(0, 6)
      .map<Item>((a) => ({ kind: "artist", id: a.id, label: a.name, sub: "Artist", href: `/admin/artists/${a.id}/edit` }));
    // Individual tracks — a song title jumps to its release's tracklist. Several
    // tracks can share one release (hence one href), so each carries its own id.
    const trk = data.tracks.filter((t) => isObjectId(t.releaseId) && t.name.toLowerCase().includes(q)).slice(0, 6)
      .map<Item>((t) => ({
        kind: "track",
        id: t.id,
        label: t.name,
        sub: t.releaseName ? `Track · ${t.releaseName}` : "Track",
        href: `/admin/releases/${t.releaseId}/tracks`,
      }));
    return [...nav, ...rel, ...art, ...trk];
  }, [query, data, canSee]);

  useEffect(() => { setActive(0); }, [query]);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);
  // Dismiss without navigating (Esc / backdrop) and return focus to the trigger,
  // so keyboard users don't lose their place when the modal closes (WCAG 2.4.3).
  const dismiss = useCallback(() => { close(); requestAnimationFrame(() => triggerRef.current?.focus()); }, [close]);

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
    else if (e.key === "Escape") { e.preventDefault(); dismiss(); }
    // The input is the modal's only tab stop (options are driven by the arrow
    // keys / Enter), so trap Tab here to stop focus escaping behind the overlay.
    else if (e.key === "Tab") { e.preventDefault(); }
  };

  const shortcutHint = isMac ? "⌘K" : "Ctrl+K";
  const shortcutAria = isMac ? "Command K" : "Control K";

  return (
    <>
      {/* Topbar trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Search (${shortcutAria})`}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] text-muted-foreground/80 lg:inline">{shortcutHint}</kbd>
      </button>

      {/* Portal to <body>: the admin topbar (this component's parent) uses
          backdrop-blur, which makes it the containing block for any position:fixed
          descendant. Rendered in place, this overlay's `fixed inset-0` resolved to
          the ~60px header, so its backdrop never reached the page and the section
          tabs / content stayed clickable behind the "modal". In document.body it has
          no filtered/transformed ancestor, so it fills the viewport and blocks
          background interaction the way a modal should. */}
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />
          <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls="cmdk-listbox"
                aria-activedescendant={items[active] ? `cmdk-opt-${active}` : undefined}
                aria-autocomplete="list"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Jump to a page, release or artist…"
                className="w-full bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div ref={listRef} id="cmdk-listbox" role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto py-1">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</p>
              ) : (
                items.map((it, i) => (
                  <button
                    key={`${it.kind}-${it.id}`}
                    type="button"
                    id={`cmdk-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(it.href)}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                      i === active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {it.kind === "release" ? <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : it.kind === "artist" ? <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : it.kind === "track" ? <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
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
        </div>,
        document.body
      ) : null}
    </>
  );
}
