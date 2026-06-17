"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";

type ArtistHit = { id: string; name: string; profilePicture: string | null };
type ReleaseHit = { id: string; name: string; thumbnail: string | null; primaryArtistName: string | null };

/** Admin-wide quick jump: type to find an artist or release, click to open it. */
export default function AdminQuickSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [artists, setArtists] = useState<ArtistHit[]>([]);
  const [releases, setReleases] = useState<ReleaseHit[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setArtists([]);
      setReleases([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const [a, r] = await Promise.all([
          fetch(`/api/artists?pageSize=5&q=${encodeURIComponent(term)}`).then((x) => (x.ok ? x.json() : { items: [] })),
          fetch(`/api/releases?pageSize=5&q=${encodeURIComponent(term)}`).then((x) => (x.ok ? x.json() : { items: [] })),
        ]);
        setArtists(a.items || []);
        setReleases(r.items || []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const hasResults = artists.length > 0 || releases.length > 0;

  return (
    <div ref={boxRef} className="relative w-full sm:max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search artists & releases…"
        aria-label="Quick search"
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {q ? (
        <button
          type="button"
          onClick={() => setQ("")}
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {open && q.trim() ? (
        <div className="absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-2xl shadow-black/50">
          {loading && !hasResults ? (
            <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </p>
          ) : !hasResults ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No artists or releases match.</p>
          ) : (
            <>
              {artists.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Artists</p>
                  {artists.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => go(`/admin/catalog/artist/${a.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/[0.04]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.profilePicture || "/placeholder.svg"} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.name}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {releases.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Releases</p>
                  {releases.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => go(`/admin/catalog/release/${r.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/[0.04]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.thumbnail || "/new-music-img1.svg"} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{r.name}</span>
                        {r.primaryArtistName ? <span className="block truncate text-xs text-muted-foreground">{r.primaryArtistName}</span> : null}
                      </span>
                    </button>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
