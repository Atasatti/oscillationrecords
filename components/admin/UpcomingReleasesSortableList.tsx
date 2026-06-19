"use client";

import React, { useEffect, useState } from "react";
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
import { GripVertical, Pencil, Trash2, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type UpcomingReleaseRow = {
  id: string;
  name: string;
  type: "single" | "ep" | "album";
  image: string;
  releaseDate: string;
  sortOrder?: number;
  preSmartLinkUrl?: string | null;
  primaryArtist?: string | null;
  featureArtist?: string | null;
  createdAt: string;
  updatedAt: string;
};

function SortableRow({
  release,
  onEdit,
  onDelete,
  onUnschedule,
}: {
  release: UpcomingReleaseRow;
  onEdit: (r: UpcomingReleaseRow) => void;
  onDelete: (id: string) => void;
  onUnschedule?: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: release.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 sm:gap-3 bg-black/40 border border-gray-800 rounded-lg p-3"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          className="touch-none shrink-0 rounded-md p-1.5 text-gray-500 hover:text-white hover:bg-white/5 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label={`Drag to reorder: ${release.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" aria-hidden />
        </button>
        <img
          src={release.image}
          alt=""
          className="w-14 h-14 rounded-lg object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{release.name}</p>
          <p className="text-xs text-gray-400 uppercase">
            {release.type} • {new Date(release.releaseDate).toLocaleDateString()}
          </p>
          {(release.primaryArtist || release.featureArtist) && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {release.primaryArtist}
              {release.primaryArtist && release.featureArtist ? " · " : ""}
              {release.featureArtist ? `feat. ${release.featureArtist}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(release)}
          className="border-gray-600"
        >
          <Pencil className="w-4 h-4 mr-1" />
          Edit
        </Button>
        {onUnschedule ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUnschedule(release.id)}
            className="border-gray-600"
            title="Remove from Coming Soon (move to draft) — keeps the release"
          >
            <CalendarOff className="w-4 h-4 mr-1" />
            Unschedule
          </Button>
        ) : null}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(release.id)}
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
}

export default function UpcomingReleasesSortableList({
  releases,
  onReorderSave,
  onEdit,
  onDelete,
  onUnschedule,
}: {
  releases: UpcomingReleaseRow[];
  onReorderSave: (ordered: UpcomingReleaseRow[]) => Promise<void>;
  onEdit: (r: UpcomingReleaseRow) => void;
  onDelete: (id: string) => void;
  onUnschedule?: (id: string) => void;
}) {
  const [local, setLocal] = useState(releases);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(releases);
  }, [releases]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = local.findIndex((r) => r.id === active.id);
    const newIndex = local.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = [...local];
    const next = arrayMove(local, oldIndex, newIndex);
    setLocal(next);

    setSaving(true);
    try {
      await onReorderSave(next);
    } catch {
      setLocal(prev);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={saving ? "opacity-80 pointer-events-none" : ""}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={local.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {local.map((release) => (
              <SortableRow
                key={release.id}
                release={release}
                onEdit={onEdit}
                onDelete={onDelete}
                onUnschedule={onUnschedule}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
