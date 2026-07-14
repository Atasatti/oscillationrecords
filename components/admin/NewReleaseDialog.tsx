"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, X, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ReleaseKind = "single" | "ep" | "album";
type ArtistLite = { id: string; name: string; profilePicture: string | null };

/**
 * Shared "New release" picker: choose type + one OR MORE primary artists, then
 * jump into the unified Release Editor with all of them pre-filled. Reused by the
 * Releases list, the Coming Soon page, and an artist's own page (where that artist
 * is pre-selected via `presetArtist` but you can still add more).
 */
export default function NewReleaseDialog({
  open,
  onOpenChange,
  status,
  presetArtist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-set the new release's status in the editor (e.g. "scheduled"). */
  status?: "draft" | "scheduled" | "released";
  /** When provided, pre-selects this artist (you can still add or remove others). */
  presetArtist?: { id: string; name: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ReleaseKind>("single");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArtistLite[]>([]);
  const [searching, setSearching] = useState(false);
  // The chosen primary artists (a release can have several).
  const [selected, setSelected] = useState<ArtistLite[]>([]);

  // Seed the preset artist on open; reset everything on close. Keyed on `open`
  // only (presetArtist is an inline object, so depending on it would re-seed every
  // render and wipe artists you added). Seeding on the open transition also lets
  // you remove the preset artist while the dialog stays open.
  useEffect(() => {
    if (open) {
      setSelected(
        presetArtist
          ? [{ id: presetArtist.id, name: presetArtist.name, profilePicture: null }]
          : []
      );
    } else {
      setKind("single");
      setQuery("");
      setResults([]);
      setSelected([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Search runs in every mode now, so you can add more artists even from a preset.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "8" });
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/artists?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.items || []);
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  const isSelected = (id: string) => selected.some((s) => s.id === id);
  const toggle = (a: ArtistLite) =>
    setSelected((prev) =>
      prev.some((s) => s.id === a.id) ? prev.filter((s) => s.id !== a.id) : [...prev, a]
    );
  const remove = (id: string) => setSelected((prev) => prev.filter((s) => s.id !== id));

  const create = () => {
    if (selected.length === 0) return;
    const params = new URLSearchParams({
      artistIds: selected.map((s) => s.id).join(","),
      kind,
    });
    if (status) params.set("status", status);
    router.push(`/admin/releases/new?${params.toString()}`);
  };

  const kindLabel = kind === "ep" ? "EP" : kind;
  const createLabel =
    selected.length === 0
      ? `Create ${kindLabel}`
      : selected.length === 1
        ? `Create ${kindLabel} for ${selected[0]?.name ?? ""}`
        : `Create ${kindLabel} · ${selected.length} artists`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>New release</DialogTitle>
          <DialogDescription>
            Choose the type and one or more primary artists. You can add the cover
            and all tracks on the next screen.
          </DialogDescription>
        </DialogHeader>

        {/* Release type */}
        <div className="flex gap-2">
          {(["single", "ep", "album"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              variant={kind === t ? "default" : "outline"}
              size="sm"
              onClick={() => setKind(t)}
              className={kind === t ? "bg-white text-black hover:bg-gray-200" : ""}
            >
              {t === "ep" ? "EP" : t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>

        {/* Selected primary artists */}
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
              >
                {a.name}
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  aria-label={`Remove ${a.name}`}
                  className="text-muted-foreground transition-colors hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Artist search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artists to add…"
            autoFocus
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Results — toggle to add/remove. Scrolls within the dialog. */}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {searching ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {query ? (
                "No artists match."
              ) : (
                <>
                  No artists yet.{" "}
                  <Link href="/admin/artists/new" className="text-foreground underline">
                    Create one
                  </Link>
                  .
                </>
              )}
            </div>
          ) : (
            results.map((a) => {
              const sel = isSelected(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a)}
                  aria-pressed={sel}
                  className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-white/[0.04] ${
                    sel ? "border-white/40 bg-white/[0.04]" : "border-border"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.profilePicture || "/placeholder.svg"}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                  {sel ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Create — enabled once at least one primary artist is chosen. */}
        <Button
          type="button"
          onClick={create}
          disabled={selected.length === 0}
          className="w-full bg-white text-black hover:bg-gray-200 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {createLabel}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
