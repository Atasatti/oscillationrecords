"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminNavbar from "@/components/local-ui/AdminNavbar";
import TrackCardSm from "@/components/local-ui/TrackCardSm";
import ExplicitBadge from "@/components/local-ui/ExplicitBadge";
import StreamingLinks, { hasStreamingLinks } from "@/components/local-ui/StreamingLinks";
import TrackFormDialog, {
  type TrackFormDialogTrack,
} from "@/components/admin/TrackFormDialog";
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
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
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
  trackCredits?: TrackFormDialogTrack["trackCredits"];
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

export default function AdminReleaseDetail() {
  const params = useParams();
  const router = useRouter();
  const releaseId = params.releaseId as string;

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [allArtists, setAllArtists] = useState<ArtistSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTrackDialogOpen, setDeleteTrackDialogOpen] = useState(false);
  const [trackToDelete, setTrackToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [trackDialogOpen, setTrackDialogOpen] = useState(false);
  const [trackDialogMode, setTrackDialogMode] = useState<"create" | "edit">(
    "create"
  );
  const [editingTrack, setEditingTrack] = useState<TrackFormDialogTrack | null>(
    null
  );
  const [lyricsDialogOpen, setLyricsDialogOpen] = useState(false);
  const [lyricsView, setLyricsView] = useState<{
    trackName: string;
    lyrics: string | null;
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, [releaseId]);

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
        router.push("/admin/catalog");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete release");
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
        alert(err.error || "Failed to delete track");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete track");
    }
  };

  const openAddTrack = () => {
    setTrackDialogMode("create");
    setEditingTrack(null);
    setTrackDialogOpen(true);
  };

  const handleTrackDialogOpenChange = (next: boolean) => {
    setTrackDialogOpen(next);
    if (!next) {
      setEditingTrack(null);
    }
  };

  const openEditTrack = (t: Track) => {
    setTrackDialogMode("edit");
    setEditingTrack({
      id: t.id,
      name: t.name,
      image: t.image,
      audioFile: t.audioFile,
      duration: t.duration,
      releaseDate: t.releaseDate,
      composer: t.composer,
      lyricist: t.lyricist,
      leadVocal: t.leadVocal,
      lyrics: t.lyrics ?? null,
      stemsFile: t.stemsFile ?? null,
      trackCredits: Array.isArray(t.trackCredits)
        ? (t.trackCredits as TrackFormDialogTrack["trackCredits"])
        : null,
      isrcCode: t.isrcCode,
      isrcExplicit: t.isrcExplicit,
      spotifyLink: t.spotifyLink,
      appleMusicLink: t.appleMusicLink,
      tidalLink: t.tidalLink,
      amazonMusicLink: t.amazonMusicLink,
      youtubeLink: t.youtubeLink,
      soundcloudLink: t.soundcloudLink,
      primaryArtistIds: t.primaryArtistIds,
      featureArtistIds: t.featureArtistIds,
      featureArtistNames: t.featureArtistNames,
    });
    setTrackDialogOpen(true);
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
        <AdminNavbar />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
        </div>
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="min-h-screen text-white">
        <AdminNavbar />
        <div className="px-[10%] py-14 text-center">
          <p className="text-red-400 mb-4">{error || "Not found"}</p>
          <Button variant="outline" className="border-gray-700" onClick={() => router.back()}>
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
    <div className="min-h-screen text-white">
      <AdminNavbar />
      <div className="px-4 sm:px-6 md:px-[10%] py-10 sm:py-14">
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
                  <DropdownMenuContent align="end" className="bg-[#0F0F0F] border-gray-800">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/catalog/edit/release/${releaseId}`}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit release
                      </Link>
                    </DropdownMenuItem>
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
                    <div className="rounded-2xl border border-gray-800 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 sm:p-6">
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
                    <div className="rounded-2xl border border-gray-800 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 sm:p-6">
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
                <div className="rounded-2xl border border-gray-800 bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
          <h2 className="text-2xl font-light tracking-tighter">Tracks</h2>
          <Button
            type="button"
            onClick={openAddTrack}
            className="bg-white text-black hover:bg-gray-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add track
          </Button>
        </div>

        {release.tracks.length === 0 ? (
          <div className="max-w-6xl xl:max-w-7xl mx-auto rounded-xl border border-dashed border-gray-700 bg-[#0F0F0F]/50 p-12 text-center">
            <p className="text-gray-400 mb-4">No tracks yet.</p>
            <Button type="button" onClick={openAddTrack} variant="outline" className="border-gray-600">
              <Plus className="w-4 h-4 mr-2" />
              Add your first track
            </Button>
          </div>
        ) : (
          <div className="max-w-6xl xl:max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {release.tracks.map((track) => (
              <div key={track.id} className="relative group w-72 h-84">
                <TrackCardSm
                  track={{
                    id: track.id,
                    name: track.name,
                    thumbnail: track.image || release.coverImage,
                    audio: track.audioFile,
                    primaryArtistName: getPrimaryArtistName(track.primaryArtistIds),
                    featureArtistNames: getFeatureArtistNames(
                      track.featureArtistNames,
                      track.featureArtistIds,
                      track.primaryArtistIds
                    ),
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
                  <DropdownMenuContent align="end" className="bg-[#0F0F0F] border-gray-800">
                    <DropdownMenuItem
                      onSelect={() => {
                        setLyricsView({
                          trackName: track.name,
                          lyrics: track.lyrics ?? null,
                        });
                        setLyricsDialogOpen(true);
                      }}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View lyrics
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!track.stemsFile}
                      onSelect={() => {
                        if (track.stemsFile) {
                          window.open(
                            track.stemsFile,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download stems
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        requestAnimationFrame(() => openEditTrack(track));
                      }}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit track
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setTrackToDelete({ id: track.id, name: track.name });
                        setDeleteTrackDialogOpen(true);
                      }}
                      className="text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete track
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}

        <TrackFormDialog
          key={
            trackDialogOpen
              ? `${trackDialogMode}-${
                  trackDialogMode === "edit"
                    ? editingTrack?.id ?? "unknown"
                    : "new"
                }`
              : "track-form-closed"
          }
          open={trackDialogOpen}
          onOpenChange={handleTrackDialogOpenChange}
          releaseId={releaseId}
          artists={allArtists}
          defaultPrimaryIds={release.primaryArtistIds}
          defaultFeatureArtistText={combinedFeatureDisplayNames(
            release.featureArtistIds,
            release.primaryArtistIds,
            buildArtistMap(allArtists),
            release.featureArtistNames
          ).join(", ")}
          mode={trackDialogMode}
          track={editingTrack}
          onSaved={fetchData}
        />

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Delete release</DialogTitle>
              <DialogDescription className="text-gray-400">
                Delete &quot;{release.name}&quot; and all of its tracks? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="border-gray-700" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteRelease}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteTrackDialogOpen} onOpenChange={setDeleteTrackDialogOpen}>
          <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Delete track</DialogTitle>
              <DialogDescription className="text-gray-400">
                Delete &quot;{trackToDelete?.name}&quot;? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                className="border-gray-700"
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
          <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white max-h-[85vh] flex flex-col sm:max-w-lg">
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
                className="border-gray-700"
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
