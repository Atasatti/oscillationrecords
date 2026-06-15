"use client";

import React, { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";
import type { AdminArtistRow } from "@/lib/admin-data";

/**
 * Manage the home "Meet the Artists" carousel: the featured artists, in order.
 * Reordering is via up/down (no drag), and only the small featured set appears
 * here, so it stays manageable regardless of roster size. Persists to
 * /api/admin/artists/home-order.
 */
export default function HomeOrderPanel() {
  const toast = useToast();
  const [items, setItems] = useState<AdminArtistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/artists/home-order");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setItems(data.items || []);
      } catch {
        if (!cancelled) toast.error("Failed to load home order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const persist = async (ordered: AdminArtistRow[]) => {
    const prev = items;
    setItems(ordered);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/artists/home-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((a) => a.id) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Failed to save order");
    } finally {
      setSaving(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <Star className="mx-auto mb-3 h-10 w-10 text-gray-600" />
        <p className="text-muted-foreground">No featured artists yet.</p>
        <p className="mt-1 text-sm text-gray-500">
          Switch to “Manage” and toggle <span className="text-foreground">Featured</span> on the
          artists you want in the home carousel.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        These artists appear in the home “Meet the Artists” carousel, in this order.
        {saving ? <span className="ml-2 text-xs">Saving…</span> : null}
      </p>
      <ol className="space-y-2">
        {items.map((a, i) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.profilePicture || "/placeholder.svg"}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
            <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={i === 0 || saving}
                onClick={() => move(i, -1)}
                aria-label={`Move ${a.name} up`}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={i === items.length - 1 || saving}
                onClick={() => move(i, 1)}
                aria-label={`Move ${a.name} down`}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
