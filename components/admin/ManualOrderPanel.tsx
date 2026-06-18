"use client";

import React, { useCallback, useEffect, useState } from "react";
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
import { GripVertical, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/local-ui/Toast";

type OrderItem = {
  id: string;
  name: string;
  thumbnail?: string | null;
  profilePicture?: string | null;
  status?: "DRAFT" | "SCHEDULED" | "RELEASED";
};

function Row({ item, index, kind }: { item: OrderItem; index: number; kind: "release" | "artist" }) {
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
      <span className="w-7 shrink-0 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.profilePicture || item.thumbnail || (kind === "artist" ? "/placeholder.svg" : "/new-music-img1.svg")}
        alt=""
        className={`h-10 w-10 shrink-0 object-cover ${kind === "artist" ? "rounded-full" : "rounded-lg"}`}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
      {item.status === "DRAFT" ? (
        <Badge variant="muted">Draft</Badge>
      ) : item.status === "SCHEDULED" ? (
        <Badge variant="warning">Scheduled</Badge>
      ) : null}
    </li>
  );
}

/**
 * Generic manual-order manager: loads the full list from `loadEndpoint`
 * (GET → { items }) and persists a custom order via `saveEndpoint`
 * (PUT { orderedIds }) on drag-end. This order drives the public-facing lists.
 */
export default function ManualOrderPanel({
  loadEndpoint,
  saveEndpoint,
  kind,
}: {
  loadEndpoint: string;
  saveEndpoint: string;
  kind: "release" | "artist";
}) {
  const toast = useToast();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(loadEndpoint, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      toast.error("Failed to load list");
    } finally {
      setLoading(false);
    }
  }, [loadEndpoint, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const prev = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setSaving(true);
    try {
      const res = await fetch(saveEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((i) => i.id) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Failed to save order");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to order yet.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="mb-3 text-sm text-muted-foreground">
        Drag to set the order shown across the site. Saves automatically.
        {saving ? <span className="ml-2 text-xs">Saving…</span> : null}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {items.map((it, i) => (
              <Row key={it.id} item={it} index={i} kind={kind} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}
