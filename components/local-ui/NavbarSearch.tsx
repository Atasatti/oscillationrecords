"use client";

import Image from "next/image";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import IconInput from "./IconInput";
import { cn } from "@/lib/utils";

type SearchHit = {
  id: string;
  name: string;
  thumbnail: string;
  primaryArtistName: string;
  artist: string;
  type: "release" | "artist";
};

type ArtistHit = {
  id: string;
  name: string;
  profilePicture?: string | null;
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function NavbarSearch({
  className,
  onNavigate,
}: {
  className?: string;
  /** e.g. close mobile drawer after picking a result */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
    top: 0,
    left: 0,
    width: 280,
    zIndex: 200,
  });

  const debounced = useDebounced(query.trim(), 280);
  const synced = query.trim() === debounced;

  useEffect(() => setMounted(true), []);

  // Reset the keyboard highlight whenever the query (and therefore the result
  // set) changes — nothing is pre-selected until the user presses ArrowDown.
  useEffect(() => setActiveIndex(-1), [debounced]);

  const updatePanelPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 280);
    setPanelStyle({
      position: "fixed",
      top: r.bottom + 8,
      left: Math.min(r.left, typeof window !== "undefined" ? window.innerWidth - width - 12 : r.left),
      width,
      zIndex: 200,
      visibility: "visible",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !mounted) return;
    updatePanelPosition();
  }, [open, mounted, results.length, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePanelPosition();
    const onResize = () => updatePanelPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (debounced.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        const [releaseFetch, artistFetch] = await Promise.allSettled([
          fetch(`/api/releases?q=${encodeURIComponent(debounced)}&limit=18`),
          fetch(`/api/artists?q=${encodeURIComponent(debounced)}&limit=8&public=1`),
        ]);

        const releaseJson =
          releaseFetch.status === "fulfilled" && releaseFetch.value.ok
            ? await releaseFetch.value.json()
            : null;
        const artistJson =
          artistFetch.status === "fulfilled" && artistFetch.value.ok
            ? await artistFetch.value.json()
            : null;

        const releaseData: SearchHit[] = Array.isArray(releaseJson)
          ? (releaseJson as SearchHit[])
          : [];
        const artistData: ArtistHit[] = Array.isArray(artistJson)
          ? (artistJson as ArtistHit[])
          : [];

        const artistHits: SearchHit[] = artistData.map((a) => ({
          id: a.id,
          name: a.name,
          thumbnail: a.profilePicture || "/new-music-img1.svg",
          primaryArtistName: a.name,
          artist: "Artist",
          type: "artist",
        }));
        const releaseHits: SearchHit[] = Array.isArray(releaseData)
          ? releaseData.map((r) => ({ ...r, type: "release" as const }))
          : [];

        const merged: SearchHit[] = [...artistHits, ...releaseHits];
        if (!cancelled) {
          setResults(merged);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      const panel = document.getElementById("navbar-search-panel");
      if (panel?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = useCallback(
    (id: string, type: SearchHit["type"]) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      onNavigate?.();
      router.push(type === "artist" ? `/artists/${id}` : `/releases/${id}`);
    },
    [onNavigate, router]
  );

  const showPanel =
    open && mounted && query.trim().length > 0;

  const panel =
    showPanel &&
    createPortal(
      <div
        id="navbar-search-panel"
        role="listbox"
        aria-label="Search results"
        style={panelStyle}
        className={cn(
          "max-h-[min(70vh,22rem)] overflow-y-auto rounded-xl border border-white/12",
          "bg-zinc-950/95 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        )}
      >
        {!synced || loading ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Searching…
          </div>
        ) : results.length === 0 ? (
          <div role="status" aria-live="polite" className="px-4 py-6 text-center text-sm text-muted-foreground">
            No artists or releases matched &ldquo;{debounced}&rdquo;.
          </div>
        ) : (
          <ul className="py-1">
            {results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  onClick={() => go(r.id, r.type)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30",
                    i === activeIndex && "bg-white/[0.06]"
                  )}
                >
                  <div className="relative mt-0.5 h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                    <Image
                      src={r.thumbnail || "/new-music-img1.svg"}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="44px"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {r.artist || r.primaryArtistName}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      {r.type === "artist" ? "artist" : "release"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>,
      document.body
    );

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <IconInput
        placeholder="Releases & artists…"
        icon={Search}
        value={query}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? "navbar-search-panel" : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          updatePanelPosition();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            if (!results.length) return;
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            if (!results.length) return;
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter" && synced && !loading && results.length) {
            e.preventDefault();
            const pick = activeIndex >= 0 ? results[activeIndex] : results[0];
            if (pick) go(pick.id, pick.type);
          }
        }}
        onArrowClick={() => {
          if (synced && !loading && results[0]) go(results[0].id, results[0].type);
          else if (query.trim()) setOpen(true);
        }}
      />
      {panel}
    </div>
  );
}
