"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
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
import {
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CatalogReleaseRow = {
  id: string;
  name: string;
  thumbnail?: string | null;
  audio?: string | null;
  type: "single" | "ep" | "album";
  primaryArtistName?: string;
  featureArtistNames?: string[];
  artist: string;
  songCount: number;
  showLatestOnHome?: boolean;
  showOnHome?: boolean;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
};

function kindLabel(type: CatalogReleaseRow["type"]) {
  return type === "album" ? "Album" : type === "ep" ? "EP" : "Single";
}

function SortableRow({
  release,
  onLatestChange,
  onShowOnHomeChange,
  onDeleteClick,
  disabled = false,
}: {
  release: CatalogReleaseRow;
  onLatestChange: (id: string, checked: boolean) => void | Promise<void>;
  onShowOnHomeChange: (id: string, checked: boolean) => void | Promise<void>;
  onDeleteClick: (id: string, name: string) => void;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: release.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  const thumb = release.thumbnail || "/new-music-img1.svg";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 rounded-lg border border-gray-800 bg-black/40 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          className={`touch-none shrink-0 rounded-md p-1.5 text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
            disabled
              ? "cursor-not-allowed opacity-30"
              : "cursor-grab active:cursor-grabbing hover:bg-white/5 hover:text-white"
          }`}
          aria-label={
            disabled
              ? "Clear the search to reorder"
              : `Drag to reorder: ${release.name}`
          }
          {...(disabled ? {} : attributes)}
          {...(disabled ? {} : listeners)}
        >
          <GripVertical className="h-5 w-5" aria-hidden />
        </button>
        <Link
          href={`/admin/catalog/release/${release.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <img
            src={thumb}
            alt=""
            className="h-14 w-14 shrink-0 rounded object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {release.name}
            </p>
            <p className="text-xs text-gray-500">
              {kindLabel(release.type)} · {release.songCount}{" "}
              {release.songCount === 1 ? "track" : "tracks"}
            </p>
            {release.primaryArtistName ? (
              <p className="mt-0.5 truncate text-xs text-gray-400">
                {release.primaryArtistName}
                {release.featureArtistNames &&
                release.featureArtistNames.length > 0
                  ? ` · ft ${release.featureArtistNames.join(", ")}`
                  : ""}
              </p>
            ) : null}
          </div>
        </Link>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400 select-none">
          <input
            type="checkbox"
            checked={Boolean(release.showLatestOnHome)}
            onChange={(e) => onLatestChange(release.id, e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
          />
          <span className="whitespace-nowrap">Latest on home</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400 select-none">
          <input
            type="checkbox"
            checked={Boolean(release.showOnHome)}
            onChange={(e) => onShowOnHomeChange(release.id, e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
          />
          <span className="whitespace-nowrap">New Music carousel</span>
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg border border-white/10"
              aria-label="Release actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-gray-800 bg-[#0F0F0F]">
            <DropdownMenuItem asChild>
              <Link href={`/admin/catalog/edit/release/${release.id}`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit release
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDeleteClick(release.id, release.name)}
              className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete release
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function CatalogReleasesSortableList({
  releases,
  onReorderSave,
  onLatestChange,
  onShowOnHomeChange,
  onDeleteClick,
}: {
  releases: CatalogReleaseRow[];
  onReorderSave: (ordered: CatalogReleaseRow[]) => Promise<void>;
  onLatestChange: (id: string, checked: boolean) => Promise<void>;
  onShowOnHomeChange: (id: string, checked: boolean) => Promise<void>;
  onDeleteClick: (id: string, name: string) => void;
}) {
  const [local, setLocal] = useState(releases);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLocal(releases);
  }, [releases]);

  const q = query.trim().toLowerCase();
  const isFiltering = q !== "";
  const filtered = isFiltering
    ? local.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.primaryArtistName || "").toLowerCase().includes(q) ||
          (r.artist || "").toLowerCase().includes(q) ||
          kindLabel(r.type).toLowerCase().includes(q)
      )
    : local;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
    <div className={saving ? "pointer-events-none opacity-80" : ""}>
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search releases by name, artist, or type…"
            aria-label="Search releases"
            className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-9 text-sm text-white placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          />
          {isFiltering ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {isFiltering ? (
          <p className="mt-2 text-xs text-gray-500">
            {filtered.length} match{filtered.length === 1 ? "" : "es"} · reordering
            is paused while searching — clear the search to drag.
          </p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No releases match “{query}”.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filtered.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {filtered.map((release) => (
                <SortableRow
                  key={release.id}
                  release={release}
                  onLatestChange={onLatestChange}
                  onShowOnHomeChange={onShowOnHomeChange}
                  onDeleteClick={onDeleteClick}
                  disabled={isFiltering}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
