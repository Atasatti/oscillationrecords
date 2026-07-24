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
  AlignLeft,
  Users,
  Lock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import CollapsibleCard from "@/components/admin/CollapsibleCard";
import {
  type EditorTrack,
  formatDuration,
  creditsSummary,
  trackLinkCount,
} from "@/lib/release-editor";
import type { UploadItem } from "./useUploadQueue";
import UploadStatusChip from "./UploadStatusChip";
import TrackCreditsInline from "./TrackCreditsInline";
import SplitEditor from "@/components/admin/SplitEditor";
import { rowsToSplits, splitsProblem } from "@/lib/release-splits";

type ArtistOpt = { id: string; name: string };

const LINK_FIELDS = [
  ["spotifyLink", "Spotify"],
  ["tidalLink", "Tidal"],
  ["appleMusicLink", "Apple Music"],
  ["amazonMusicLink", "Amazon Music"],
  ["youtubeLink", "YouTube"],
  ["soundcloudLink", "SoundCloud"],
] as const;

/** Compact status chip for the collapsed row — audio / ISRC / lyrics at a glance. */
function Chip({ tone, children }: { tone: "ok" | "gap" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : tone === "gap"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-white/10 text-gray-500";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {children}
    </span>
  );
}

const fieldLabel = "mb-1.5 block text-xs font-medium text-muted-foreground";

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
  focusLyrics = false,
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
  /** Deep-link from the Releases list's lyrics badge: open this row's lyrics
   * section on mount. Set only on tracks that are actually missing lyrics. */
  focusLyrics?: boolean;
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

  // Which accordion sections are open. "Track" leads; if a released track is
  // missing its required ISRC, open "IDs & links" too so the gap is visible.
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>(() => ({
    track: true,
    // Open the identifiers group up-front when this row needs attention there — a
    // missing required ISRC, or a Needs-Attention deep-link (e.g. a duplicate ISRC,
    // where the offending code is present so isrcMissing is false).
    ids: (requireIsrc && !track.isrcCode.trim()) || highlight,
    // Same idea for lyrics: the Releases list's lyrics badge deep-links here, and
    // it set this only on the tracks that are actually missing them.
    lyrics: focusLyrics,
  }));
  const toggleSec = (k: string) => setOpenSecs((s) => ({ ...s, [k]: !s[k] }));

  // Resolve the track's own artists/feature for the collapsed-row summary.
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

  const hasAudio = !!track.audioFile;
  const hasIsrc = !!track.isrcCode.trim();
  const hasLyrics = !!track.lyrics.trim();
  const hasSynced = !!track.syncedLyrics.trim();
  const creditText = creditsSummary(track.credits);
  const linkCount = trackLinkCount(track);

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
        synced?: string | null;
        method?: string;
        note?: string | null;
      } | null;
      if (data?.lyrics || data?.synced) {
        onChange({
          ...(data.lyrics ? { lyrics: data.lyrics } : {}),
          ...(data.synced ? { syncedLyrics: data.synced } : {}),
        });
        const how = data.method === "isrc" ? "by ISRC" : "by title + artist match";
        const what =
          data.lyrics && data.synced
            ? "lyrics + timing"
            : data.synced
              ? "timing (no plain lyrics)"
              : "lyrics";
        setLyricsNote(
          `Pulled ${what} ${how} — review${data.method === "search" ? " carefully" : ""} and save.`
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

  // Completeness chips shown on the row header (collapsed = click to expand).
  const metaChips = (
    <>
      <Chip tone={hasAudio ? "ok" : "gap"}>{hasAudio ? "audio" : "no audio"}</Chip>
      {hasIsrc ? (
        <Chip tone="ok">ISRC</Chip>
      ) : isrcMissing ? (
        <Chip tone="gap">needs ISRC</Chip>
      ) : null}
      <Chip tone={hasLyrics ? "ok" : "muted"}>{hasLyrics ? "lyrics" : "no lyrics"}</Chip>
      {primaryNames.length || featText ? (
        <span className="truncate text-xs text-gray-500">
          {primaryNames.join(", ")}
          {featText ? ` · feat. ${featText}` : ""}
        </span>
      ) : (
        <span className="text-xs text-amber-400/80">no artists</span>
      )}
    </>
  );

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
            aria-label="Track name"
            className="h-9 w-full border-white/10 bg-black/40"
          />
          {track.expanded ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{metaChips}</div>
          ) : (
            <button
              type="button"
              onClick={onToggleExpand}
              className="mt-1.5 flex max-w-full flex-wrap items-center gap-1.5 text-left"
            >
              {metaChips}
              <span className="shrink-0 text-xs text-gray-600">· edit</span>
            </button>
          )}
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

      {/* Expanded editor — accordion of grouped sections (only "Track" open by
          default, mirroring the artist editor). Rare/technical fields live in the
          muted "IDs & links" group so they don't compete with the primary ones. */}
      {track.expanded ? (
        <div className="space-y-2.5 border-t border-white/10 p-3">
          {/* ---- Track: the primary per-track metadata ---- */}
          <CollapsibleCard
            title="Track"
            icon={<Music className="h-4 w-4 text-muted-foreground" aria-hidden />}
            open={!!openSecs.track}
            onToggle={() => toggleSec("track")}
            summary={
              `${hasAudio ? "audio ✓" : "no audio"} · ` +
              `${primaryNames.length ? `${primaryNames.length} artist${primaryNames.length === 1 ? "" : "s"}` : "no artists"}`
            }
          >
            <div className="space-y-4">
              <div>
                <label className={fieldLabel}>Audio (WAV / MP3)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => audioRef.current?.click()}
                  >
                    <Music className="mr-2 h-4 w-4" />
                    {track.audioFile ? "Replace audio" : "Choose audio file"}
                  </Button>
                  <UploadStatusChip item={audioItem} hasFile={!!track.audioFile} onRetry={onRetryAudio} />
                  {track.duration > 0 ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatDuration(track.duration)}
                    </span>
                  ) : null}
                </div>
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
              </div>

              <div>
                <label className={fieldLabel}>Primary artists *</label>
                <MultiSelect
                  options={artists.map((a) => ({ value: a.id, label: a.name }))}
                  selected={track.primaryArtistIds}
                  onChange={(ids) => onChange({ primaryArtistIds: ids })}
                  placeholder="Primary artist"
                />
              </div>

              <div>
                <label className={fieldLabel}>Featured (optional)</label>
                <Input
                  value={track.featureArtistText}
                  onChange={(e) => onChange({ featureArtistText: e.target.value })}
                  placeholder="e.g. Guest Name, Another Artist"
                  aria-label="Featured artists"
                />
              </div>
            </div>
          </CollapsibleCard>

          {/* ---- Lyrics ---- */}
          <CollapsibleCard
            title="Lyrics"
            icon={<AlignLeft className="h-4 w-4 text-muted-foreground" aria-hidden />}
            open={!!openSecs.lyrics}
            onToggle={() => toggleSec("lyrics")}
            summary={
              hasLyrics
                ? hasSynced
                  ? "plain + synced"
                  : "plain"
                : hasSynced
                  ? "synced only"
                  : "none yet"
            }
          >
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Lyrics</label>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2 text-xs"
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
                  aria-label="Lyrics"
                  rows={5}
                />
                {lyricsNote ? (
                  <p className="mt-1 text-xs text-muted-foreground">{lyricsNote}</p>
                ) : null}
              </div>
              <div>
                <label className={fieldLabel}>
                  Synced lyrics (LRC){" "}
                  <span className="text-gray-600">— optional, timing</span>
                </label>
                <Textarea
                  value={track.syncedLyrics}
                  onChange={(e) => onChange({ syncedLyrics: e.target.value })}
                  placeholder="[00:08.95] time-synced lyrics…"
                  aria-label="Synced lyrics (LRC)"
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </CollapsibleCard>

          {/* ---- Credits & splits ---- */}
          <CollapsibleCard
            title="Credits & splits"
            icon={<Users className="h-4 w-4 text-muted-foreground" aria-hidden />}
            open={!!openSecs.credits}
            onToggle={() => toggleSec("credits")}
            summary={creditText || "none yet"}
          >
            <div className="space-y-5">
              <TrackCreditsInline
                value={track.credits}
                onChange={(credits) => onChange({ credits })}
                idPrefix={track.rowId}
                onCopyToAllTracks={onCopyCreditsToAll}
              />
              <div>
                <p className={fieldLabel}>Royalty split (optional)</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Per-track contributors and shares — e.g. an album track with a different
                  collaborator. Leave empty to use the release-level split.
                </p>
                <SplitEditor value={track.splits} onChange={(splits) => onChange({ splits })} />
                {(() => {
                  const s = rowsToSplits(track.splits);
                  const problem = s.length > 0 ? splitsProblem(s) : null;
                  return problem ? (
                    <p className="mt-2 text-xs text-amber-400/90">
                      {problem} Changes to this split aren&apos;t saved until it&apos;s valid.
                    </p>
                  ) : null;
                })()}
              </div>
            </div>
          </CollapsibleCard>

          {/* ---- IDs & links (internal / rarely-touched) ---- */}
          <CollapsibleCard
            title="IDs & links"
            icon={<Lock className="h-4 w-4 text-amber-500/70" aria-hidden />}
            tone="warning"
            open={!!openSecs.ids}
            onToggle={() => toggleSec("ids")}
            summary={
              `${hasIsrc ? "ISRC ✓" : isrcMissing ? "needs ISRC" : "ISRC –"} · ` +
              `${linkCount} link${linkCount === 1 ? "" : "s"}`
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={fieldLabel}>ISRC {requireIsrc ? "*" : ""}</label>
                  <Input
                    value={track.isrcCode}
                    onChange={(e) => onChange({ isrcCode: e.target.value })}
                    placeholder="e.g. GBXXX2400123"
                    aria-label="ISRC"
                    className={`font-mono text-sm ${isrcMissing ? "border-red-500/70" : ""}`}
                  />
                  {isrcMissing ? (
                    <p className="mt-1 text-xs text-red-400">Required before publishing</p>
                  ) : null}
                </div>
                <div>
                  <label className={fieldLabel}>ISWC</label>
                  <Input
                    value={track.iswc}
                    onChange={(e) => onChange({ iswc: e.target.value })}
                    placeholder="e.g. T3125086393"
                    aria-label="ISWC"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className={fieldLabel}>Explicit</label>
                <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => onChange({ isrcExplicit: false })}
                    aria-pressed={!track.isrcExplicit}
                    className={`rounded-md px-3.5 py-1 text-xs font-medium transition-colors ${
                      !track.isrcExplicit ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ isrcExplicit: true })}
                    aria-pressed={track.isrcExplicit}
                    className={`rounded-md px-3.5 py-1 text-xs font-medium transition-colors ${
                      track.isrcExplicit ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Yes
                  </button>
                </div>
              </div>

              <div>
                <label className={fieldLabel}>
                  Track-level streaming links{" "}
                  <span className="text-gray-600">— usually inherited from the release</span>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {LINK_FIELDS.map(([k, label]) => (
                    <Input
                      key={k}
                      value={track[k]}
                      onChange={(e) => onChange({ [k]: e.target.value } as Partial<EditorTrack>)}
                      placeholder={label}
                      aria-label={`${label} link`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className={fieldLabel}>Stems (optional)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => stemsRef.current?.click()}
                  >
                    {track.stemsFile ? "Replace stems" : "Upload stems"}
                  </Button>
                  <UploadStatusChip
                    item={stemsItem}
                    hasFile={!!track.stemsFile}
                    onRetry={onRetryStems}
                    readyLabel="Stems ready"
                    emptyLabel="No stems"
                  />
                </div>
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
              </div>
            </div>
          </CollapsibleCard>
        </div>
      ) : null}
    </div>
  );
}
