"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import TrackCardSm from "@/components/local-ui/TrackCardSm";
import ExplicitBadge from "@/components/local-ui/ExplicitBadge";
import StreamingLinks, { hasStreamingLinks } from "@/components/local-ui/StreamingLinks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Download,
  FileText,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
  Send,
  CalendarClock,
  EyeOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useToast } from "@/components/local-ui/Toast";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
} from "@/lib/release-format";

interface Track {
  id: string;
  name: string;
  image?: string;
  audioFile: string;
  duration: number;
  releaseDate?: string | null;
  composer?: string | null;
  lyricist?: string | null;
  leadVocal?: string | null;
  lyrics?: string | null;
  stemsFile?: string | null;
  trackCredits?: unknown;
  isrcCode?: string | null;
  isrcExplicit?: boolean;
  spotifyLink?: string;
  appleMusicLink?: string;
  tidalLink?: string;
  amazonMusicLink?: string;
  youtubeLink?: string;
  soundcloudLink?: string;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames?: string[];
}

interface ReleaseDetail {
  id: string;
  name: string;
  coverImage: string;
  type: "single" | "ep" | "album";
  status?: "DRAFT" | "SCHEDULED" | "RELEASED";
  description?: string | null;
  releaseDate?: string | null;
  composer?: string | null;
  lyricist?: string | null;
  leadVocal?: string | null;
  upcCode?: string | null;
  isrcExplicit?: boolean;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames?: string[];
  tracks: Track[];
}

interface ArtistSummary {
  id: string;
  name: string;
}

/** A single draggable track card with its actions menu. */
function SortableTrackCard({
  track,
  coverImage,
  primaryArtistName,
  featureArtistNames,
  editHref,
  onViewLyrics,
  onDelete,
}: {
  track: Track;
  coverImage: string;
  primaryArtistName: string;
  featureArtistNames: string[];
  editHref: string;
  onViewLyrics: (track: Track) => void;
  onDelete: (track: Track) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group w-72 h-84">
      <button
        type="button"
        className="absolute left-2 top-2 z-20 rounded-md bg-black/60 p-1.5 text-gray-300 backdrop-blur-sm transition-opacity hover:text-white cursor-grab active:cursor-grabbing touch-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Drag to reorder: ${track.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" aria-hidden />
      </button>

      <TrackCardSm
        track={{
          id: track.id,
          name: track.name,
          thumbnail: track.image || coverImage,
          audio: track.audioFile,
          primaryArtistName,
          featureArtistNames,
          spotifyLink: track.spotifyLink,
          appleMusicLink: track.appleMusicLink,
          tidalLink: track.tidalLink,
          amazonMusicLink: track.amazonMusicLink,
          youtubeLink: track.youtubeLink,
          soundcloudLink: track.soundcloudLink,
          isrcExplicit: track.isrcExplicit,
        }}
      />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-[#141414] border-white/10">
          <DropdownMenuItem onSelect={() => onViewLyrics(track)}>
            <FileText className="w-4 h-4 mr-2" />
            View lyrics
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!track.stemsFile}
            onSelect={() => {
              if (track.stemsFile) {
                window.open(track.stemsFile, "_blank", "noopener,noreferrer");
              }
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Download stems
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={editHref}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit track
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete(track)}
            className="text-red-400"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete track
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function AdminReleaseDetail() {
  const params = useParams();
  const router = useRouter();
  const releaseId = params.releaseId as string;
  const toast = useToast();

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [allArtists, setAllArtists] = useState<ArtistSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusWorking, setStatusWorking] = useState(false);
  const [deleteTrackDialogOpen, setDeleteTrackDialogOpen] = useState(false);
  const [trackToDelete, setTrackToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [lyricsDialogOpen, setLyricsDialogOpen] = useState(false);
  const [lyricsView, setLyricsView] = useState<{
    trackName: string;
    lyrics: string | null;
  } | null>(null);
  const [orderedTracks, setOrderedTracks] = useState<Track[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchData();
  }, [releaseId]);

  // Keep the local drag order in sync whenever the release (re)loads.
  useEffect(() => {
    setOrderedTracks(release?.tracks ?? []);
  }, [release]);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/releases/${releaseId}`);
      if (response.ok) {
        const data = await response.json();
        setRelease({
          id: data.id,
          name: data.name,
          coverImage: data.coverImage,
          type: data.type,
          status: data.status,
          description: data.description,
          releaseDate: data.releaseDate,
          composer: data.composer,
          lyricist: data.lyricist,
          leadVocal: data.leadVocal,
          upcCode: data.upcCode,
          isrcExplicit: data.isrcExplicit,
          spotifyLink: data.spotifyLink,
          appleMusicLink: data.appleMusicLink,
          tidalLink: data.tidalLink,
          amazonMusicLink: data.amazonMusicLink,
          youtubeLink: data.youtubeLink,
          soundcloudLink: data.soundcloudLink,
          primaryArtistIds: data.primaryArtistIds || [],
          featureArtistIds: data.featureArtistIds || [],
          featureArtistNames: data.featureArtistNames || [],
          tracks: data.tracks || data.songs || [],
        });
        const artistsResponse = await fetch("/api/artists");
        if (artistsResponse.ok) {
          setAllArtists(await artistsResponse.json());
        }
      } else {
        setError(response.status === 404 ? "Release not found" : "Failed to load");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load");
    } finally {
      setIsLoading(false);
    }
  };

  const getArtistNames = (ids: string[] = []) =>
    ids
      .map((id) => allArtists.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name));

  const getPrimaryArtistName = (primaryArtistIds: string[] = []) => {
    const names = getArtistNames(primaryArtistIds);
    return names.length > 0 ? names.join(", ") : "Unknown Artist";
  };

  const getFeatureArtistNames = (
    featureArtistNames: string[] | undefined,
    featureArtistIds: string[] = [],
    primaryArtistIds: string[] = []
  ) => {
    const map = buildArtistMap(allArtists);
    return combinedFeatureDisplayNames(
      featureArtistIds,
      primaryArtistIds,
      map,
      featureArtistNames
    );
  };

  const handleDeleteRelease = async () => {
    if (!release) return;
    try {
      const res = await fetch(`/api/releases/${releaseId}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteDialogOpen(false);
        toast.success("Release deleted");
        // Back to the releases list (this release no longer exists).
        router.push("/admin/catalog/releases");
        // Radix can leave <body style="pointer-events:none"> when its dialog
        // unmounts mid-navigation, which freezes the whole admin (sidebar
        // included) until a manual refresh. Restore it once the route settles.
        setTimeout(() => {
          if (typeof document !== "undefined") document.body.style.pointerEvents = "";
        }, 300);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete release");
    }
  };

  const handleDeleteTrackConfirm = async () => {
    if (!trackToDelete) return;
    try {
      const res = await fetch(`/api/tracks/${trackToDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTrackDialogOpen(false);
        setTrackToDelete(null);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete track");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete track");
    }
  };

  const editorHref = `/admin/catalog/releases/${releaseId}/edit`;

  // Quick status transitions from the detail page (no full editor round-trip).
  const changeStatus = async (next: "DRAFT" | "SCHEDULED" | "RELEASED") => {
    if (!release) return;
    if (next === "RELEASED" && release.tracks.length === 0) {
      toast.error("Add at least one track before publishing.");
      return;
    }
    if (next === "SCHEDULED") {
      const d = release.releaseDate ? new Date(release.releaseDate) : null;
      if (!d || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        toast.error("Set a future release date in the editor before scheduling.");
        router.push(editorHref);
        return;
      }
    }
    setStatusWorking(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        next === "RELEASED" ? "Published" : next === "SCHEDULED" ? "Scheduled" : "Moved to draft"
      );
      fetchData();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setStatusWorking(false);
    }
  };

  const handleTrackReorder = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedTracks.findIndex((t) => t.id === active.id);
    const newIndex = orderedTracks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = orderedTracks;
    const next = arrayMove(orderedTracks, oldIndex, newIndex);
    setOrderedTracks(next);
    try {
      const res = await fetch("/api/admin/tracks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId, orderedIds: next.map((t) => t.id) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err.error === "string" ? err.error : "Failed to save track order"
        );
        setOrderedTracks(prev);
      }
    } catch {
      setOrderedTracks(prev);
      toast.error("Network error — could not save track order.");
    }
  };

  const kindTitle =
    release?.type === "album"
      ? "Album"
      : release?.type === "ep"
        ? "EP"
        : "Single";

  const releasePrimaryNames = release
    ? getArtistNames(release.primaryArtistIds)
    : [];
  const releaseFeatureNames = release
    ? getFeatureArtistNames(
        release.featureArtistNames,
        release.featureArtistIds,
        release.primaryArtistIds
      )
    : [];

  if (isLoading) {
    return (
      <div className="min-h-screen text-white">
                <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
        </div>
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="min-h-screen text-white">
                <div className="px-[10%] py-14 text-center">
          <p className="text-red-400 mb-4">{error || "Not found"}</p>
          <Button variant="outline" className="border-white/10" onClick={() => router.back()}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const hasCredits = Boolean(
    release.composer ||
      release.lyricist ||
      release.leadVocal ||
      release.upcCode
  );
  const showAbout = Boolean(release.description) || Boolean(release.releaseDate);
  const streamProps = {
    spotifyLink: release.spotifyLink,
    appleMusicLink: release.appleMusicLink,
    tidalLink: release.tidalLink,
    amazonMusicLink: release.amazonMusicLink,
    youtubeLink: release.youtubeLink,
    soundcloudLink: release.soundcloudLink,
  };
  const showStream = hasStreamingLinks(streamProps);

  return (
    <div className="text-white">
      <div>
        <div className="max-w-6xl xl:max-w-7xl mx-auto mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="-ml-2 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to catalog
          </Button>
        </div>

        <div className="mb-10 max-w-6xl xl:max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 xl:gap-12 items-start">
            <div className="w-full max-w-[min(100%,320px)] mx-auto lg:mx-0 shrink-0">
              <img
                src={release.coverImage}
                alt={release.name}
                className="w-full aspect-square object-cover rounded-2xl ring-1 ring-white/10 shadow-2xl shadow-black/40"
              />
            </div>

            <div className="flex-1 min-w-0 w-full space-y-6">
              <div className="flex items-start justify-between gap-4">
                <header className="space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
                      {kindTitle}
                    </p>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      {release.tracks.length} track{release.tracks.length === 1 ? "" : "s"}
                    </span>
                    {release.status === "RELEASED" ? (
                      <Badge variant="success">Live</Badge>
                    ) : release.status === "SCHEDULED" ? (
                      <Badge variant="warning">Scheduled</Badge>
                    ) : release.status === "DRAFT" ? (
                      <Badge variant="muted">Draft</Badge>
                    ) : null}
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-light tracking-tighter flex flex-wrap items-center gap-3">
                    <span>{release.name}</span>
                    {release.isrcExplicit ? <ExplicitBadge size="lg" /> : null}
                  </h1>
                  {(releasePrimaryNames.length > 0 || releaseFeatureNames.length > 0) ? (
                    <div className="space-y-0.5">
                      {releasePrimaryNames.length > 0 ? (
                        <p className="text-base sm:text-lg text-white/95 font-medium">
                          {releasePrimaryNames.join(", ")}
                        </p>
                      ) : null}
                      {releaseFeatureNames.length > 0 ? (
                        <p className="text-sm text-gray-500">ft {releaseFeatureNames.join(", ")}</p>
                      ) : null}
                    </div>
                  ) : null}
                </header>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg border border-white/10">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#141414] border-white/10">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/catalog/releases/${releaseId}/edit`}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit release
                      </Link>
                    </DropdownMenuItem>
                    {release.status !== "DRAFT" ? (
                      <DropdownMenuItem asChild>
                        <a href={`/releases/${releaseId}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View on site
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    {release.status !== "RELEASED" ? (
                      <DropdownMenuItem disabled={statusWorking} onSelect={() => changeStatus("RELEASED")}>
                        <Send className="w-4 h-4 mr-2" />
                        Publish now
                      </DropdownMenuItem>
                    ) : null}
                    {release.status !== "SCHEDULED" ? (
                      <DropdownMenuItem disabled={statusWorking} onSelect={() => changeStatus("SCHEDULED")}>
                        <CalendarClock className="w-4 h-4 mr-2" />
                        Schedule (Coming Soon)
                      </DropdownMenuItem>
                    ) : null}
                    {release.status !== "DRAFT" ? (
                      <DropdownMenuItem disabled={statusWorking} onSelect={() => changeStatus("DRAFT")}>
                        <EyeOff className="w-4 h-4 mr-2" />
                        {release.status === "SCHEDULED" ? "Unschedule (to draft)" : "Unpublish (to draft)"}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleteDialogOpen(true)}
                      className="text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete release
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {(showAbout || hasCredits) && (
                <div
                  className={`grid gap-4 lg:gap-5 ${showAbout && hasCredits ? "md:grid-cols-2" : ""}`}
                >
                  {showAbout ? (
                    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 sm:p-6">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                        About
                      </h2>
                      {release.releaseDate ? (
                        <p className="text-sm text-white/90 font-medium mb-3">
                          Release date:{" "}
                          {new Date(release.releaseDate).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      ) : null}
                      {release.description ? (
                        <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
                          {release.description}
                        </p>
                      ) : !release.releaseDate ? (
                        <p className="text-sm text-gray-500">No description.</p>
                      ) : null}
                    </div>
                  ) : null}

                  {hasCredits ? (
                    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 sm:p-6">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                        Credits
                      </h2>
                      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[minmax(5rem,auto)_1fr]">
                        {release.composer ? (
                          <>
                            <dt className="text-gray-500 font-medium">Composer</dt>
                            <dd className="text-gray-200">{release.composer}</dd>
                          </>
                        ) : null}
                        {release.lyricist ? (
                          <>
                            <dt className="text-gray-500 font-medium">Lyricist</dt>
                            <dd className="text-gray-200">{release.lyricist}</dd>
                          </>
                        ) : null}
                        {release.leadVocal ? (
                          <>
                            <dt className="text-gray-500 font-medium">Lead vocal</dt>
                            <dd className="text-gray-200">{release.leadVocal}</dd>
                          </>
                        ) : null}
                        {release.upcCode ? (
                          <>
                            <dt className="text-gray-500 font-medium">UPC</dt>
                            <dd className="text-gray-200 font-mono text-xs sm:text-sm break-all">
                              {release.upcCode}
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}
                </div>
              )}

              {showStream ? (
                <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 shrink-0">
                    Stream
                  </h2>
                  <StreamingLinks {...streamProps} size="md" className="sm:ml-auto" />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4 max-w-6xl xl:max-w-7xl mx-auto">
          <div className="space-y-1">
            <h2 className="text-2xl font-light tracking-tighter">Tracks</h2>
            {release.tracks.length > 1 ? (
              <p className="text-xs text-gray-500">Drag the grip to reorder tracks.</p>
            ) : null}
          </div>
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <Link href={editorHref}>
              <Plus className="w-4 h-4 mr-2" />
              Add / edit tracks
            </Link>
          </Button>
        </div>

        {release.tracks.length === 0 ? (
          <div className="max-w-6xl xl:max-w-7xl mx-auto rounded-xl border border-dashed border-white/10 bg-[#141414]/50 p-12 text-center">
            <p className="text-gray-400 mb-4">No tracks yet.</p>
            <Button asChild variant="outline" className="border-gray-600">
              <Link href={editorHref}>
                <Plus className="w-4 h-4 mr-2" />
                Add your first track
              </Link>
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleTrackReorder}
          >
            <SortableContext
              items={orderedTracks.map((t) => t.id)}
              strategy={rectSortingStrategy}
            >
              <div className="max-w-6xl xl:max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {orderedTracks.map((track) => (
                  <SortableTrackCard
                    key={track.id}
                    track={track}
                    coverImage={release.coverImage}
                    primaryArtistName={getPrimaryArtistName(track.primaryArtistIds)}
                    featureArtistNames={getFeatureArtistNames(
                      track.featureArtistNames,
                      track.featureArtistIds,
                      track.primaryArtistIds
                    )}
                    editHref={editorHref}
                    onViewLyrics={(t) => {
                      setLyricsView({ trackName: t.name, lyrics: t.lyrics ?? null });
                      setLyricsDialogOpen(true);
                    }}
                    onDelete={(t) => {
                      setTrackToDelete({ id: t.id, name: t.name });
                      setDeleteTrackDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-[#141414] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Delete release</DialogTitle>
              <DialogDescription className="text-gray-400">
                Delete &quot;{release.name}&quot; and all of its tracks? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="border-white/10" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteRelease}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteTrackDialogOpen} onOpenChange={setDeleteTrackDialogOpen}>
          <DialogContent className="bg-[#141414] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Delete track</DialogTitle>
              <DialogDescription className="text-gray-400">
                Delete &quot;{trackToDelete?.name}&quot;? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => {
                  setDeleteTrackDialogOpen(false);
                  setTrackToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteTrackConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={lyricsDialogOpen}
          onOpenChange={(open) => {
            setLyricsDialogOpen(open);
            if (!open) setLyricsView(null);
          }}
        >
          <DialogContent className="bg-[#141414] border-white/10 text-white max-h-[85vh] flex flex-col sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Lyrics</DialogTitle>
              <DialogDescription className="text-gray-400 truncate">
                {lyricsView?.trackName}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-[120px] max-h-[55vh] overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-4 text-sm text-gray-200 whitespace-pre-wrap">
              {lyricsView?.lyrics?.trim()
                ? lyricsView.lyrics
                : "No lyrics saved for this track. Add them in Edit track."}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => {
                  setLyricsDialogOpen(false);
                  setLyricsView(null);
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
