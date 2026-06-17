"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ReleaseKind = "single" | "ep" | "album";

/**
 * Shared "New release" picker: choose type + primary artist, then jump into the
 * unified Release Editor. Reused by the Releases list and the Coming Soon page so
 * every "New release" button behaves the same.
 */
export default function NewReleaseDialog({
  open,
  onOpenChange,
  /** Pre-set the new release's status in the editor (e.g. "scheduled"). */
  status,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: "draft" | "scheduled" | "released";
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ReleaseKind>("single");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; profilePicture: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);

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

  const go = (artistId: string) => {
    const params = new URLSearchParams({ artistId, kind });
    if (status) params.set("status", status);
    router.push(`/admin/catalog/releases/new?${params.toString()}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New release</DialogTitle>
          <DialogDescription>
            Choose the type and the primary artist. You can add the cover and all
            tracks on the next screen.
          </DialogDescription>
        </DialogHeader>

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

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for the primary artist…"
            autoFocus
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="mt-1 max-h-72 space-y-1 overflow-y-auto">
          {searching ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {query ? "No artists match." : "No artists yet — create one first."}
            </p>
          ) : (
            results.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => go(a.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-white/[0.04]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.profilePicture || "/placeholder.svg"}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
