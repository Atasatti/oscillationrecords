"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Plus,
  Loader2,
  CheckCircle2,
  UploadCloud,
  Wand2,
  ChevronsDownUp,
  ChevronsUpDown,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";
import {
  type EditorTrack,
  newEditorTrack,
  editorTrackFromSerialized,
  trackIsPersistable,
  trackPublishIssues,
  buildTrackPayload,
  readAudioDuration,
  titleFromFilename,
  isAudioFile,
  readError,
} from "@/lib/release-editor";
import { useUploadQueue, type UploadComplete } from "./useUploadQueue";
import TrackRow from "./TrackRow";
import ApplyToAllDialog, { type ApplyToAllValue } from "./ApplyToAllDialog";

type ArtistOpt = { id: string; name: string };

export default function TrackList({
  releaseId,
  artists,
  defaultPrimaryArtistIds,
  defaultFeatureArtistText = "",
  requireIsrc,
  initialTracks,
  onActivityChange,
  onUnsavedChange,
  onValidityChange,
}: {
  releaseId: string;
  artists: ArtistOpt[];
  defaultPrimaryArtistIds: string[];
  defaultFeatureArtistText?: string;
  /** ISRC required per track (release is RELEASED). */
  requireIsrc: boolean;
  initialTracks: Record<string, unknown>[];
  /** Reports whether uploads/saves are in flight (used to gate publishing). */
  onActivityChange?: (active: boolean) => void;
  /** Reports whether leaving now would lose track work — an in-flight
   * upload/save, or a failed save still showing "Couldn't save". Lets the parent
   * editor's unsaved-changes guard warn before in-app navigation. */
  onUnsavedChange?: (unsaved: boolean) => void;
  /** Reports track count + how many have publish-blocking issues. */
  onValidityChange?: (info: { trackCount: number; issueCount: number }) => void;
}) {
  const toast = useToast();
  const [tracks, setTracks] = useState<EditorTrack[]>(() =>
    initialTracks.map((t) => editorTrackFromSerialized(t, artists))
  );
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const [saveTick, setSaveTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  // True after a save fails — surfaces a persistent "Couldn't save — Retry" state
  // (instead of letting a transient toast be the only signal) and arms the
  // beforeunload guard so the admin can't lose unsaved track edits unknowingly.
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const [dragOver, setDragOver] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);

  const markDirty = useCallback(() => setSaveTick((t) => t + 1), []);

  const updateRow = useCallback(
    (rowId: string, patch: Partial<EditorTrack>, dirty = true) => {
      setTracks((prev) =>
        prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r))
      );
      if (dirty) markDirty();
    },
    [markDirty]
  );

  const onUploadComplete = useCallback(
    ({ rowId, kind, fileURL }: UploadComplete) => {
      updateRow(rowId, kind === "audio" ? { audioFile: fileURL } : { stemsFile: fileURL });
    },
    [updateRow]
  );

  const queue = useUploadQueue(onUploadComplete);

  // ---- persistence (debounced full-snapshot PATCH; bulk upsert + prune) ----
  const save = useCallback(async () => {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const snapshot = tracksRef.current;
      const payloadTracks = snapshot
        .map((row, idx) => ({ row, idx }))
        // Always include rows that are already persisted (have a server id), even
        // if a field is momentarily empty mid-edit. The server treats an omitted
        // id as an explicit deletion, so dropping an incomplete saved row here
        // would silently delete it (and its audio/credits). New rows are only
        // sent once persistable — they need an audio file first.
        .filter(({ row }) => row.id || trackIsPersistable(row))
        .map(({ row, idx }) => buildTrackPayload(row, idx));

      const res = await fetch(`/api/releases/${releaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: payloadTracks }),
      });
      if (!res.ok) {
        setSaveError(true);
        toast.error(await readError(res, "Failed to save tracks"));
        return;
      }
      const data = await res.json().catch(() => null);
      const returned: Record<string, unknown>[] = Array.isArray(data?.tracks)
        ? data.tracks
        : [];
      // Reconcile server ids onto freshly-created rows (match by unique audio URL).
      setTracks((prev) =>
        prev.map((row) => {
          if (row.id || !row.audioFile) return row;
          const match = returned.find(
            (rt) => rt.audioFile && String(rt.audioFile) === row.audioFile
          );
          return match ? { ...row, id: String(match.id) } : row;
        })
      );
      setSaveError(false);
      setSavedOnce(true);
    } catch (e) {
      console.error(e);
      setSaveError(true);
      toast.error("Failed to save tracks");
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingRef.current) {
        pendingRef.current = false;
        void save();
      }
    }
  }, [releaseId, toast]);

  // Debounced autosave — only after a real mutation (saveTick > 0), never on mount
  // (which would send an empty snapshot and wipe existing tracks).
  useEffect(() => {
    if (saveTick === 0) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
  }, [saveTick, save]);

  // Surface activity (uploads or in-flight save) to the parent — gates publishing.
  const active = queue.hasActive || saving;
  useEffect(() => {
    onActivityChange?.(active);
  }, [active, onActivityChange]);

  // Surface "leaving now loses work" to the parent's unsaved-changes guard: an
  // in-flight upload/save, or a failed save still pending retry. Without this,
  // in-app nav (Back/Cancel) wouldn't warn about unsaved track edits, since the
  // tracklist autosaves separately from the release-details form.
  useEffect(() => {
    onUnsavedChange?.(active || saveError);
  }, [active, saveError, onUnsavedChange]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (queue.hasActive || savingRef.current || saveError) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [queue.hasActive, saveError]);

  // ---- adding tracks ----
  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const all = Array.from(fileList);
      const audio = all.filter(isAudioFile);
      const rejected = all.length - audio.length;
      if (rejected > 0) {
        toast.error(
          `Skipped ${rejected} non-audio file${rejected === 1 ? "" : "s"} (MP3, WAV, FLAC… only).`
        );
      }
      if (audio.length === 0) return;

      const created = audio.map((file) => ({
        row: newEditorTrack({
          name: titleFromFilename(file.name),
          primaryArtistIds: defaultPrimaryArtistIds,
          featureArtistText: defaultFeatureArtistText,
        }),
        file,
      }));
      setTracks((prev) => [...prev, ...created.map((c) => c.row)]);
      for (const { row, file } of created) {
        queue.enqueue(row.rowId, file, "audio");
        void readAudioDuration(file).then((d) =>
          updateRow(row.rowId, { duration: d }, false)
        );
      }
    },
    [defaultPrimaryArtistIds, defaultFeatureArtistText, queue, toast, updateRow]
  );

  const addEmptyTrack = useCallback(() => {
    setTracks((prev) => [
      ...prev,
      newEditorTrack({
        primaryArtistIds: defaultPrimaryArtistIds,
        featureArtistText: defaultFeatureArtistText,
        name: "",
      }),
    ]);
  }, [defaultPrimaryArtistIds, defaultFeatureArtistText]);

  const replaceAudio = useCallback(
    (rowId: string, file: File) => {
      if (!isAudioFile(file)) {
        toast.error("Please choose an audio file (MP3, WAV, FLAC, etc.).");
        return;
      }
      queue.enqueue(rowId, file, "audio");
      void readAudioDuration(file).then((d) => updateRow(rowId, { duration: d }, false));
    },
    [queue, toast, updateRow]
  );

  const uploadStems = useCallback(
    (rowId: string, file: File) => {
      queue.enqueue(rowId, file, "stems");
    },
    [queue]
  );

  const removeRow = useCallback(
    (rowId: string) => {
      queue.clearRow(rowId);
      setTracks((prev) => prev.filter((r) => r.rowId !== rowId));
      markDirty();
    },
    [queue, markDirty]
  );

  const applyToAll = useCallback(
    (value: ApplyToAllValue) => {
      setTracks((prev) =>
        prev.map((r) => ({
          ...r,
          ...(value.primaryArtistIds !== undefined && {
            primaryArtistIds: value.primaryArtistIds,
          }),
          ...(value.featureArtistText !== undefined && {
            featureArtistText: value.featureArtistText,
          }),
          ...(value.isrcExplicit !== undefined && {
            isrcExplicit: value.isrcExplicit,
          }),
        }))
      );
      markDirty();
    },
    [markDirty]
  );

  const setAllExpanded = useCallback((expanded: boolean) => {
    setTracks((prev) => prev.map((r) => ({ ...r, expanded })));
  }, []);

  // Report track count + publish-blocking issues so the editor can gate publish.
  useEffect(() => {
    const issueCount = tracks.filter(
      (t) => trackPublishIssues(t, requireIsrc).length > 0
    ).length;
    onValidityChange?.({ trackCount: tracks.length, issueCount });
  }, [tracks, requireIsrc, onValidityChange]);

  // ---- dnd ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    setTracks((prev) => {
      const oldIndex = prev.findIndex((r) => r.rowId === a.id);
      const newIndex = prev.findIndex((r) => r.rowId === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    markDirty();
  };

  const uploadingCount = Object.values(queue.items).filter(
    (i) => i.status === "queued" || i.status === "presigning" || i.status === "uploading"
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-gray-200">
            Tracks{" "}
            <span className="text-sm font-normal text-gray-500">
              ({tracks.length})
            </span>
          </h3>
          <p className="text-xs text-gray-500">
            Drop audio files to add tracks — they upload in the background while you
            fill in details. Track changes save automatically.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {uploadingCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <UploadCloud className="h-3.5 w-3.5" /> {uploadingCount} uploading
            </span>
          ) : null}
          {saving ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          ) : saveError ? (
            <button
              type="button"
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-amber-400 hover:bg-amber-400/10"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Couldn’t save — Retry
            </button>
          ) : savedOnce ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          ) : null}
        </div>
      </div>

      {tracks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10"
            onClick={() => setApplyOpen(true)}
          >
            <Wand2 className="mr-1 h-4 w-4" /> Apply to all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-gray-400"
            onClick={() => setAllExpanded(true)}
          >
            <ChevronsUpDown className="mr-1 h-4 w-4" /> Expand all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-gray-400"
            onClick={() => setAllExpanded(false)}
          >
            <ChevronsDownUp className="mr-1 h-4 w-4" /> Collapse all
          </Button>
        </div>
      ) : null}

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => pickRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver ? "border-white/40 bg-white/[0.04]" : "border-white/10 hover:border-white/20"
        }`}
      >
        <UploadCloud className="mb-2 h-8 w-8 text-gray-500" />
        <p className="text-sm text-gray-300">
          Drop audio files here, or click to choose
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Add the whole tracklist at once — MP3, WAV, FLAC…
        </p>
        <input
          ref={pickRef}
          type="file"
          accept="audio/*,.wav,.mp3,.flac,.m4a,.aac"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {tracks.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={tracks.map((t) => t.rowId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {tracks.map((track, idx) => (
                <TrackRow
                  key={track.rowId}
                  track={track}
                  index={idx}
                  artists={artists}
                  audioItem={queue.items[`${track.rowId}:audio`]}
                  stemsItem={queue.items[`${track.rowId}:stems`]}
                  requireIsrc={requireIsrc}
                  onChange={(patch) => updateRow(track.rowId, patch)}
                  onRemove={() => removeRow(track.rowId)}
                  onReplaceAudio={(file) => replaceAudio(track.rowId, file)}
                  onRetryAudio={() => queue.retry(`${track.rowId}:audio`)}
                  onUploadStems={(file) => uploadStems(track.rowId, file)}
                  onRetryStems={() => queue.retry(`${track.rowId}:stems`)}
                  onToggleExpand={() =>
                    updateRow(track.rowId, { expanded: !track.expanded }, false)
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-white/10"
        onClick={addEmptyTrack}
      >
        <Plus className="mr-1 h-4 w-4" /> Add a track manually
      </Button>

      <ApplyToAllDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        artists={artists}
        trackCount={tracks.length}
        defaultPrimaryArtistIds={defaultPrimaryArtistIds}
        onApply={applyToAll}
      />
    </div>
  );
}
