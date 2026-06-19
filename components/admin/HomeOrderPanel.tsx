"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Star, Search, Plus, X, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";

type OrderItem = {
  id: string;
  name: string;
  profilePicture?: string | null;
  thumbnail?: string | null;
};

type SearchHit = { id: string; name: string; profilePicture?: string | null; thumbnail?: string | null };

/** One draggable carousel row (grip + thumbnail + name + remove). */
function CarouselRow({
  item,
  index,
  kind,
  onRemove,
}: {
  item: OrderItem;
  index: number;
  kind: "release" | "artist";
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 1 : 0,
  };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Drag to reorder: ${item.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 shrink-0 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.profilePicture || item.thumbnail || "/placeholder.svg"}
        alt=""
        className={`h-10 w-10 shrink-0 object-cover ${kind === "artist" ? "rounded-full" : "rounded-lg"}`}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-400"
        onClick={onRemove}
        aria-label={`Remove ${item.name} from the carousel`}
        title="Remove from carousel"
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}

/**
 * Generic "home order" manager: lists a featured set from `endpoint` (GET →
 * { items }), and lets the admin **add** (search), **remove**, and **reorder**
 * it — persisting order via PUT { orderedIds } to the same endpoint, and
 * membership via the entity's `showOnHome` / `featuredOnHome` flag. Used for both
 * the New Music releases carousel and the Featured Artists carousel.
 */
export default function HomeOrderPanel({
  endpoint,
  emptyTitle,
  emptyHint,
  kind,
}: {
  endpoint: string;
  emptyTitle: string;
  emptyHint: React.ReactNode;
  /** Which entity this carousel features — drives search + the membership flag. */
  kind: "release" | "artist";
}) {
  const toast = useToast();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const searchUrl = kind === "artist" ? "/api/artists" : "/api/releases";
  const flagKey = kind === "artist" ? "featuredOnHome" : "showOnHome";
  const noun = kind === "artist" ? "artist" : "release";

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      toast.error("Failed to load home order");
    } finally {
      setLoading(false);
    }
  }, [endpoint, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Search for items not already featured.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${searchUrl}?pageSize=8&q=${encodeURIComponent(term)}`);
        const data = res.ok ? await res.json() : { items: [] };
        const featured = new Set(items.map((i) => i.id));
        setResults((data.items || []).filter((r: SearchHit) => !featured.has(r.id)));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, searchUrl, items]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const setFlag = async (id: string, value: boolean) => {
    const target = kind === "artist" ? `/api/artists/${id}` : `/api/releases/${id}`;
    const res = await fetch(target, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [flagKey]: value }),
    });
    if (!res.ok) throw new Error();
  };

  const add = async (hit: SearchHit) => {
    setQ("");
    setOpen(false);
    setResults([]);
    // Optimistic append; reload to pick up server-assigned order.
    setItems((prev) => [...prev, { id: hit.id, name: hit.name, profilePicture: hit.profilePicture, thumbnail: hit.thumbnail }]);
    try {
      await setFlag(hit.id, true);
      await load();
    } catch {
      toast.error(`Failed to add ${noun}`);
      load();
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems((list) => list.filter((i) => i.id !== id));
    try {
      await setFlag(id, false);
    } catch {
      setItems(prev);
      toast.error(`Failed to remove ${noun}`);
    }
  };

  const persistOrder = async (ordered: OrderItem[]) => {
    const prev = items;
    setItems(ordered);
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persistOrder(arrayMove(items, oldIndex, newIndex));
  };

  // Search box — always available so you can add without leaving the page.
  const searchBox = (
    <div ref={boxRef} className="relative mb-4 max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={`Add a ${noun} to the carousel…`}
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {open && q.trim() ? (
        <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-2xl shadow-black/50">
          {searching && results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No {noun}s to add.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => add(r)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/[0.04]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.profilePicture || r.thumbnail || "/placeholder.svg"}
                  alt=""
                  className={`h-8 w-8 shrink-0 object-cover ${kind === "artist" ? "rounded-full" : "rounded-lg"}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.name}</span>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {searchBox}
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Star className="mx-auto mb-3 h-10 w-10 text-gray-600" />
          <p className="text-muted-foreground">{emptyTitle}</p>
          <p className="mt-1 text-sm text-gray-500">{emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {searchBox}
      <p className="mb-3 text-sm text-muted-foreground">
        Drag to set the order shown on the home page.
        {saving ? <span className="ml-2 text-xs">Saving…</span> : null}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {items.map((a, i) => (
              <CarouselRow key={a.id} item={a} index={i} kind={kind} onRemove={() => remove(a.id)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}
