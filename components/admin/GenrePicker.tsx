"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Check, Tags } from "lucide-react";
import { SPOTIFY_GENRES } from "@/lib/spotify-genres";

/**
 * Genres input: free-text (comma-separated) plus a "Browse" picker of real
 * Spotify genres. Typing still works for anything not in the list.
 */
export default function GenrePicker({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => value.split(",").map((s) => s.trim()).filter(Boolean),
    [value]
  );
  const selectedLower = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? SPOTIFY_GENRES.filter((g) => g.toLowerCase().includes(term)) : SPOTIFY_GENRES;
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (g: string) => {
    if (selectedLower.has(g.toLowerCase())) {
      onChange(selected.filter((s) => s.toLowerCase() !== g.toLowerCase()).join(", "));
    } else {
      onChange([...selected, g].join(", "));
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0"
          aria-expanded={open}
        >
          <Tags className="h-4 w-4" /> Browse
        </Button>
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-card p-2 shadow-2xl shadow-black/50">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Spotify genres…"
              autoFocus
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                No match. Type it in the field to add a custom genre.
              </p>
            ) : (
              filtered.map((g) => {
                const on = selectedLower.has(g.toLowerCase());
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggle(g)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-white/30 bg-white/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-white/20 hover:text-foreground"
                    }`}
                  >
                    {on ? <Check className="h-3 w-3" /> : null}
                    {g}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
