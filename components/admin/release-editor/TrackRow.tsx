"use client";
import React, { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Music,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { type EditorTrack, formatDuration } from "@/lib/release-editor";
import type { UploadItem } from "./useUploadQueue";
import UploadStatusChip from "./UploadStatusChip";
import TrackCreditsInline from "./TrackCreditsInline";
import SplitEditor from "@/components/admin/SplitEditor";

type ArtistOpt = { id: string; name: string };

export default function TrackRow({
  track,
  index,
  artists,
  audioItem,
  stemsItem,
  requireIsrc,
  onChange,
  onRemove,
  onReplaceAudio,
  onRetryAudio,
  onUploadStems,
  onRetryStems,
  onToggleExpand,
  onCopyCreditsToAll,
  highlight = false,
}: {
  track: EditorTrack;
  index: number;
  artists: ArtistOpt[];
  audioItem: UploadItem | undefined;
  stemsItem: UploadItem | undefined;
  requireIsrc: boolean;
  onChange: (patch: Partial<EditorTrack>) => void;
  onRemove: () => void;
  onReplaceAudio: (file: File) => void;
  onRetryAudio: () => void;
  onUploadStems: (file: File) => void;
  onRetryStems: () => void;
  onToggleExpand: () => void;
  onCopyCreditsToAll?: () => void;
  /** Flag this row (deep-link from Needs-Attention, e.g. a duplicate ISRC): a
   * coloured ring + auto-scroll into view so the clashing tracks are obvious. */
  highlight?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.rowId });
  const audioRef = useRef<HTMLInputElement>(null);
  const stemsRef = useRef<HTMLInputElement>(null);
  // Compose dnd-kit's ref with our own so we can scroll a highlighted row into view.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    rowRef.current = node;
  };
  useEffect(() => {
    if (highlight && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  const isrcMissing = requireIsrc && !track.isrcCode.trim();

  // Resolve the track's own artists/feature for the collapsed-row summary, so it's
  // obvious each track has its own editable artists + features (not just a name).
  const primaryNames = track.primaryArtistIds
    .map((id) => artists.find((a) => a.id === id)?.name)
    .filter(Boolean) as string[];
  const featText = track.featureArtistText.trim();

  // First primary artist name (for a title+artist Musixmatch fallback when there's
  // no ISRC). Resolved from the roster passed into the editor.
  const primaryArtistName =
    track.primaryArtistIds
      .map((id) => artists.find((a) => a.id === id)?.name)
      .find((n): n is string => Boolean(n)) ?? "";
  const canPullLyrics =
    !!track.isrcCode.trim() || (!!track.name.trim() && !!primaryArtistName);

  const [pullingLyrics, setPullingLyrics] = useState(false);
  const [lyricsNote, setLyricsNote] = useState<string | null>(null);

  // Fetch this track's lyrics from Musixmatch into the field for review. The admin
  // still saves the release to persist — this only fills the textarea.
  async function handlePullLyrics() {
    setPullingLyrics(true);
    setLyricsNote(null);
    try {
      const res = await fetch("/api/admin/lyrics/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isrc: track.isrcCode.trim(),
          title: track.name.trim(),
          artist: primaryArtistName,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        lyrics: string | null;
        method?: string;
        note?: string | null;
      } | null;
      if (data?.lyrics) {
        onChange({ lyrics: data.lyrics });
        setLyricsNote(
          data.method === "isrc"
            ? "Pulled by ISRC — review and save."
            : "Pulled by title + artist match — review carefully before saving."
        );
      } else {
        setLyricsNote(data?.note || "No lyrics found on Musixmatch.");
      }
    } catch {
      setLyricsNote("Couldn't reach the lyrics service. Try again.");
    } finally {
      setPullingLyrics(false);
    }
  }

  return (
    <div
      ref={setRefs}
      style={style}
      className={`rounded-lg border bg-[#141414] transition-colors ${
        highlight
          ? "border-amber-400/70 ring-2 ring-amber-400/40"
          : "border-white/10"
      }`}
    >
      {/* Collapsed summary row */}
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none rounded p-1 text-gray-500 hover:text-white active:cursor-grabbing"
          aria-label={`Drag to reorder track ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="w-5 shrink-0 text-center text-sm tabular-nums text-gray-500">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <Input
            value={track.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Track name *"
            className="h-9 w-full border-white/10 bg-black/40"
          />
          {!track.expanded ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="mt-1 flex max-w-full items-center gap-1 text-left text-xs text-gray-500 hover:text-gray-300"
            >
              <span className="truncate">
                {primaryNames.length || featText
                  ? `${primaryNames.join(", ")}${featText ? ` · feat. ${featText}` : ""}`
                  : "No artists set"}
                {!track.lyrics.trim() ? (
                  <span className="text-gray-600"> · no lyrics yet</span>
                ) : null}
              </span>
              <span className="shrink-0 text-gray-600">· edit details</span>
            </button>
          ) : null}
        </div>
        <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-gray-500 sm:block">
          {formatDuration(track.duration)}
        </span>
        <div className="hidden shrink-0 sm:block">
          <UploadStatusChip item={audioItem} hasFile={!!track.audioFile} onRetry={onRetryAudio} />
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          aria-label={track.expanded ? "Collapse track" : "Expand track"}
        >
          {track.expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-950/30 hover:text-red-400"
          aria-label="Remove track"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile status line */}
      <div className="px-3 pb-2 sm:hidden">
        <UploadStatusChip item={audioItem} hasFile={!!track.audioFile} onRetry={onRetryAudio} />
      </div>

      {/* Expanded editor */}
      {track.expanded ? (
        <div className="space-y-5 border-t border-white/10 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Audio (WAV / MP3)
            </label>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => audioRef.current?.click()}
            >
              <Music className="mr-2 h-4 w-4" />
              {track.audioFile ? "Replace audio" : "Choose audio file"}
            </Button>
            <input
              ref={audioRef}
              type="file"
              accept="audio/*,.wav,.mp3"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onReplaceAudio(file);
                e.target.value = "";
              }}
            />
            <p className="mt-1 text-xs text-gray-500">
              Duration: {formatDuration(track.duration)}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Stems (optional)
            </label>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => stemsRef.current?.click()}
            >
              {track.stemsFile ? "Replace stems" : "Upload stems"}
            </Button>
            <input
              ref={stemsRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadStems(file);
                e.target.value = "";
              }}
            />
            <div className="mt-1">
              <UploadStatusChip
                item={stemsItem}
                hasFile={!!track.stemsFile}
                onRetry={onRetryStems}
                readyLabel="Stems ready"
                emptyLabel="No stems"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                ISRC {requireIsrc ? "*" : ""}
              </label>
              <Input
                value={track.isrcCode}
                onChange={(e) => onChange({ isrcCode: e.target.value })}
                placeholder="ISRC"
                className={`border-white/10 bg-black/40 font-mono text-sm ${
                  isrcMissing ? "border-red-500/70" : ""
                }`}
              />
              {isrcMissing ? (
                <p className="mt-1 text-xs text-red-400">
                  Required before publishing
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                ISWC
              </label>
              <Input
                value={track.iswc}
                onChange={(e) => onChange({ iswc: e.target.value })}
                placeholder="e.g. T3125086393"
                className="border-white/10 bg-black/40 font-mono text-sm"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-400">
                Explicit
              </span>
              <div className="flex flex-wrap gap-4 pt-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name={`explicit-${track.rowId}`}
                    checked={!track.isrcExplicit}
                    onChange={() => onChange({ isrcExplicit: false })}
                  />
                  No
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name={`explicit-${track.rowId}`}
                    checked={track.isrcExplicit}
                    onChange={() => onChange({ isrcExplicit: true })}
                  />
                  Yes
                </label>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-gray-400">Lyrics</label>
              <Button
                type="button"
                variant="outline"
                className="h-7 border-white/10 px-2 text-xs"
                disabled={pullingLyrics || !canPullLyrics}
                onClick={handlePullLyrics}
                title={
                  canPullLyrics
                    ? "Fetch lyrics from Musixmatch by ISRC (falls back to track name + primary artist)"
                    : "Add an ISRC, or a track name and a primary artist, to pull lyrics"
                }
              >
                {pullingLyrics ? "Pulling…" : "Pull from Musixmatch"}
              </Button>
            </div>
            <Textarea
              value={track.lyrics}
              onChange={(e) => {
                onChange({ lyrics: e.target.value });
                if (lyricsNote) setLyricsNote(null);
              }}
              placeholder="Lyrics"
              rows={4}
              className="border-white/10 bg-black/40"
            />
            {lyricsNote ? (
              <p className="mt-1 text-xs text-gray-500">{lyricsNote}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-400">Track URLs</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ["spotifyLink", "Spotify"],
                  ["tidalLink", "Tidal"],
                  ["appleMusicLink", "Apple Music"],
                  ["amazonMusicLink", "Amazon Music"],
                  ["youtubeLink", "YouTube"],
                  ["soundcloudLink", "SoundCloud"],
                ] as const
              ).map(([k, label]) => (
                <Input
                  key={k}
                  value={track[k]}
                  onChange={(e) => onChange({ [k]: e.target.value } as Partial<EditorTrack>)}
                  placeholder={label}
                  className="border-white/10 bg-black/40"
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-400">Artists *</p>
            <MultiSelect
              options={artists.map((a) => ({ value: a.id, label: a.name }))}
              selected={track.primaryArtistIds}
              onChange={(ids) => onChange({ primaryArtistIds: ids })}
              placeholder="Primary artist"
            />
            <div className="h-2" />
            <p className="mb-1 text-xs text-gray-500">Featured (optional)</p>
            <Input
              value={track.featureArtistText}
              onChange={(e) => onChange({ featureArtistText: e.target.value })}
              placeholder="e.g. Guest Name, Another Artist"
              className="border-white/10 bg-black/40"
            />
          </div>

          <TrackCreditsInline
            value={track.credits}
            onChange={(credits) => onChange({ credits })}
            idPrefix={track.rowId}
            onCopyToAllTracks={onCopyCreditsToAll}
          />

          <div>
            <p className="mb-1 text-xs font-medium text-gray-400">Royalty split (optional)</p>
            <p className="mb-2 text-xs text-gray-500">
              Per-track contributors and shares — e.g. an album track with a different
              collaborator. Leave empty to use the release-level split.
            </p>
            <SplitEditor value={track.splits} onChange={(splits) => onChange({ splits })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
