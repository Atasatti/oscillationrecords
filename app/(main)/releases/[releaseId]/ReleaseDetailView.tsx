"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExplicitBadge from "@/components/local-ui/ExplicitBadge";
import StreamingLinks, { hasStreamingLinks } from "@/components/local-ui/StreamingLinks";
import { useSession } from "next-auth/react";
import { useMusic } from "@/contexts/music-context";
import { slugify } from "@/lib/slug";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ReleaseCardSm from "@/components/local-ui/ReleaseCardSm";
import ReleasePressSection from "@/components/local-ui/ReleasePressSection";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
} from "@/lib/release-format";
import type { ReleaseDetailDTO, ReleaseDetailTrackDTO } from "@/lib/catalog-data";

// Server-fetched, fully-typed release detail (see lib/catalog-data.ts). Tracks
// use the public payload shape (no ISRC/ISWC/lyrics/stems).
type Release = ReleaseDetailDTO;
type TrackRow = ReleaseDetailTrackDTO;

interface ParsedTrackCredit {
  category?: string;
  name?: string;
  role?: string;
}

interface OtherRelease {
  id: string;
  name: string;
  thumbnail: string;
  type: string;
  artist: string;
  primaryArtistName?: string;
  featureArtistNames?: string[];
  songCount?: number;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
}

export default function ReleaseDetailView({ release }: { release: Release }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { playSong } = useMusic();
  const releaseId = release.id;

  const [selectedTrack, setSelectedTrack] = useState<TrackRow | null>(null);
  const [otherReleases, setOtherReleases] = useState<OtherRelease[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const moreScrollRef = useRef<HTMLDivElement>(null);
  const trackedReleaseId = useRef<string | null>(null);

  const updateMoreArrows = useCallback(() => {
    const el = moreScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  const scrollMore = (dir: "prev" | "next") => {
    const el = moreScrollRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const delta = (first?.offsetWidth ?? 288) + 16;
    el.scrollBy({ left: dir === "next" ? delta : -delta, behavior: "smooth" });
  };

  useEffect(() => {
    if (!release) return;
    (async () => {
      try {
        const res = await fetch("/api/releases");
        if (!res.ok) return;
        const all = await res.json() as Array<{
          id: string;
          name: string;
          thumbnail: string;
          type: string;
          artist: string;
          artistId: string;
        }>;
        const primaryIds = new Set(release.primaryArtistIds);
        const filtered = all
          .filter((r) => r.id !== release.id && primaryIds.has(r.artistId))
          .slice(0, 6);
        setOtherReleases(filtered);
      } catch {
        // silently ignore
      }
    })();
  }, [release]);

  useEffect(() => {
    const el = moreScrollRef.current;
    if (!el || otherReleases.length === 0) return;
    updateMoreArrows();
    el.addEventListener("scroll", updateMoreArrows, { passive: true });
    const ro = new ResizeObserver(() => updateMoreArrows());
    ro.observe(el);
    const id = requestAnimationFrame(() => updateMoreArrows());
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener("scroll", updateMoreArrows);
      ro.disconnect();
    };
  }, [otherReleases, updateMoreArrows]);

  // Track release view — guard with ref so it only fires once per release ID
  useEffect(() => {
    if (release && trackedReleaseId.current !== release.id) {
      trackedReleaseId.current = release.id;
      trackReleaseView(release);
    }
  }, [release]);

  const trackReleaseView = async (release: Release) => {
    try {
      // Get primary artist (first one) for tracking
      const primaryArtistId = release.primaryArtistIds[0];
      const primaryArtist = primaryArtistId 
        ? release.artists.find(a => a.id === primaryArtistId)
        : null;
      
      await fetch("/api/analytics/track-play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: "release",
          contentId: release.id,
          contentName: release.name,
          artistId: primaryArtistId || null,
          artistName: primaryArtist?.name || 'Unknown Artist',
          playDuration: null,
          completed: false,
        }),
      });
    } catch (error) {
      console.error("Error tracking release view:", error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const releasePrimaryNames = release
    ? release.primaryArtistIds
        .map((id) => release.artists.find((a) => a.id === id)?.name)
        .filter((name): name is string => Boolean(name))
    : [];
  const artistMap = release ? buildArtistMap(release.artists) : new Map();
  const releaseFeatureNames = release
    ? combinedFeatureDisplayNames(
        release.featureArtistIds,
        release.primaryArtistIds,
        artistMap,
        release.featureArtistNames
      )
    : [];

  const kindLabel =
    release.type === "album" ? "Album" : release.type === "ep" ? "EP" : "Single";
  const releaseCredits = Array.isArray(release.credits)
    ? release.credits.filter(
        (c) => c && c.role && Array.isArray(c.people) && c.people.length > 0
      )
    : [];
  const hasCredits = Boolean(
    release.composer || release.lyricist || release.leadVocal
  ) || releaseCredits.length > 0;
  const showAbout =
    Boolean(release.description) || Boolean(release.releaseDate) ||
    Boolean(release.primaryGenre) || Boolean(release.secondaryGenre);
  const streamProps = {
    spotifyLink: release.spotifyLink,
    appleMusicLink: release.appleMusicLink,
    tidalLink: release.tidalLink,
    amazonMusicLink: release.amazonMusicLink,
    youtubeLink: release.youtubeLink,
    soundcloudLink: release.soundcloudLink,
  };
  const showStream = hasStreamingLinks(streamProps);
  const trackList = release.tracks?.length ? release.tracks : release.songs ?? [];
  const getTrackPrimaryLine = (song: TrackRow) => {
    const primaryNames = song.primaryArtistIds
      .map((id) => release.artists.find((a) => a.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    return primaryNames.length ? primaryNames.join(", ") : "Unknown Artist";
  };
  const getTrackFeatureNames = (song: TrackRow) =>
    combinedFeatureDisplayNames(
      song.featureArtistIds,
      song.primaryArtistIds,
      artistMap,
      song.featureArtistNames
    );
  const formatArtistLine = (song: TrackRow) => {
    const primaryName = getTrackPrimaryLine(song);
    const featureNames = getTrackFeatureNames(song);
    return featureNames.length > 0
      ? `${primaryName} ft ${featureNames.join(", ")}`
      : primaryName;
  };
  const playTrackFromArtwork = (song: TrackRow) => {
    if (status === "unauthenticated" || !session) {
      const currentPath = window.location.pathname;
      router.push(`/login?callbackUrl=${encodeURIComponent(currentPath)}`);
      return;
    }

    const artist = formatArtistLine(song);
    playSong({
      id: String(song.id),
      title: song.name,
      artist,
      image: song.image || release.coverImage,
      audio: song.audioFile,
      isExplicit: Boolean(song.isrcExplicit),
      releaseType: release.type,
    });
  };
  const parseTrackCredits = (credits: unknown): ParsedTrackCredit[] => {
    if (!Array.isArray(credits)) return [];
    return credits.reduce<ParsedTrackCredit[]>((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      const row = item as Record<string, unknown>;
      const name = row.name ? String(row.name) : undefined;
      if (!name) return acc;
      acc.push({
        category: row.category ? String(row.category) : undefined,
        name,
        role: row.role ? String(row.role) : undefined,
      });
      return acc;
    }, []);
  };
  const formatCreditCategory = (category?: string) =>
    category
      ? category
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Credit";

  return (
    <div>
      <div className="min-h-screen text-white">
        <div className="px-4 sm:px-6 md:px-[10%] py-10 sm:py-14">
          <div className="mb-10 lg:mb-14 max-w-6xl xl:max-w-7xl mx-auto">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-6 -ml-2 text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 xl:gap-12 items-start">
              <div className="w-full max-w-[min(100%,320px)] mx-auto lg:mx-0 shrink-0">
                <img
                  src={release.coverImage}
                  alt={release.name}
                  className="w-full aspect-square object-cover rounded-2xl ring-1 ring-white/10 shadow-2xl shadow-black/40"
                />
              </div>

              <div className="flex-1 min-w-0 space-y-6 w-full">
                <header className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    {kindLabel}
                  </p>
                  <h1 className="text-4xl sm:text-5xl font-light tracking-tighter flex flex-wrap items-center gap-3">
                    <span>{release.name}</span>
                    {release.isrcExplicit ? <ExplicitBadge size="xl" /> : null}
                  </h1>
                  {(releasePrimaryNames.length > 0 || releaseFeatureNames.length > 0) ? (
                    <div className="space-y-0.5">
                      {releasePrimaryNames.length > 0 ? (
                        <p className="text-lg sm:text-xl text-white/95 font-medium">
                          {releasePrimaryNames.join(", ")}
                        </p>
                      ) : null}
                      {releaseFeatureNames.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          ft {releaseFeatureNames.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </header>

                {(showAbout || hasCredits) && (
                  <div
                    className={`grid gap-4 lg:gap-5 ${showAbout && hasCredits ? "md:grid-cols-2" : ""}`}
                  >
                    {showAbout ? (
                      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 sm:p-6 space-y-4">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          About
                        </h2>
                        <div className="flex flex-wrap gap-2">
                          {release.releaseDate ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              {new Date(release.releaseDate).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                          ) : null}
                          {[release.primaryGenre, release.secondaryGenre].filter(Boolean).map((g) => (
                            <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                              {g}
                            </span>
                          ))}
                        </div>
                        {release.description ? (
                          <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap border-t border-white/5 pt-4">
                            {release.description}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {hasCredits ? (
                      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 sm:p-6">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
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
                          {releaseCredits.map((c, i) => (
                            <React.Fragment key={i}>
                              <dt className="text-gray-500 font-medium">{c.role}</dt>
                              <dd className="text-gray-200">{c.people.join(", ")}</dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </div>
                )}

                {showStream ? (
                  <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                      Stream
                    </h2>
                    <StreamingLinks
                      {...streamProps}
                      size="md"
                      className="sm:ml-auto"
                      context="release"
                      contextId={release.id}
                      contextName={release.name}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Coming Soon banner for scheduled (future-dated) releases */}
          {release.status === "SCHEDULED" &&
          release.releaseDate &&
          new Date(release.releaseDate) > new Date() ? (
            <div className="mt-12 max-w-6xl xl:max-w-7xl mx-auto rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] px-6 py-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Coming soon
              </p>
              <p className="mt-2 text-2xl font-light tracking-tight">
                Out{" "}
                {new Date(release.releaseDate).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              {release.preSaveUrl ? (
                <a
                  href={release.preSaveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-white/90 transition hover:border-white/30 hover:bg-white/[0.1]"
                >
                  Pre-save <span aria-hidden>→</span>
                </a>
              ) : null}
            </div>
          ) : null}

          {/* Songs */}
          <div className="mt-12 max-w-6xl xl:max-w-7xl mx-auto px-0">
            <h2 className="text-2xl font-light mb-6">Tracks</h2>
            {trackList.length === 0 ? (
              <p className="text-gray-400">
                {release.status === "SCHEDULED"
                  ? "Tracklist to be revealed."
                  : "No tracks available."}
              </p>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-b from-white/[0.04] to-white/[0.015]">
                {trackList.map((song, index) => {
                  const trackStreamProps = {
                    spotifyLink: song.spotifyLink,
                    appleMusicLink: song.appleMusicLink,
                    tidalLink: song.tidalLink,
                    amazonMusicLink: song.amazonMusicLink,
                    youtubeLink: song.youtubeLink,
                    soundcloudLink: song.soundcloudLink,
                  };
                  const showTrackLinks = hasStreamingLinks(trackStreamProps);
                  const trackFeatureNames = getTrackFeatureNames(song);
                  return (
                  <div
                    key={song.id}
                    className="border-b border-white/5 last:border-b-0"
                  >
                    <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-start gap-3 px-3 sm:px-4 py-2.5">
                      <span className="w-5 text-xs text-gray-500 text-right">{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => playTrackFromArtwork(song)}
                        className="group/cover relative h-11 w-11 overflow-hidden rounded-md ring-1 ring-white/10 hover:ring-white/30 transition"
                        aria-label={`Play ${song.name}`}
                      >
                        <img
                          src={song.image || release.coverImage}
                          alt={song.name}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/30 transition-colors" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm text-white/95 truncate flex items-center gap-1.5">
                          <span>{song.name}</span>
                          {song.isrcExplicit ? <ExplicitBadge size="sm" /> : null}
                        </p>
                        <div className="mt-0.5 space-y-0.5">
                          <p className="text-xs text-white/90 font-medium truncate">
                            {getTrackPrimaryLine(song)}
                          </p>
                          {trackFeatureNames.length > 0 ? (
                            <p className="text-xs text-muted-foreground truncate">
                              ft {trackFeatureNames.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="hidden md:flex justify-start">
                        <StreamingLinks
                          {...trackStreamProps}
                          size="sm"
                          className="opacity-85 hover:opacity-100 transition-opacity"
                          context="track"
                          contextId={song.id}
                          contextName={song.name}
                        />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {formatDuration(song.duration)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedTrack(song)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label={`Open details for ${song.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                    {showTrackLinks ? (
                      <div className="md:hidden px-3 sm:px-4 pb-3 pt-0 pl-[5.5rem] sm:pl-[5.75rem]">
                        <StreamingLinks
                          {...trackStreamProps}
                          size="sm"
                          className="opacity-90"
                          context="track"
                          contextId={song.id}
                          contextName={song.name}
                        />
                      </div>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Other releases by same artist — carousel */}
          {otherReleases.length > 0 ? (
            <div className="mt-16 max-w-6xl xl:max-w-7xl mx-auto px-0 pb-10">
              <div className="flex items-end justify-between mb-8 border-t border-white/5 pt-10">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Discography</p>
                  <h2 className="text-2xl font-light tracking-tight text-white">
                    More by <span className="text-white/70">{releasePrimaryNames.join(", ")}</span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/releases")}
                  className="text-xs text-gray-500 hover:text-white transition-colors shrink-0 ml-4"
                >
                  View all →
                </button>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {canScrollLeft ? (
                  <button
                    type="button"
                    onClick={() => scrollMore("prev")}
                    aria-label="Previous"
                    className="flex-shrink-0 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-white/10"
                  >
                    <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                  </button>
                ) : null}
                <div
                  ref={moreScrollRef}
                  className="flex min-w-0 flex-1 gap-4 overflow-x-auto scroll-smooth"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {otherReleases.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/releases/${slugify(r.name)}`)}
                      className="cursor-pointer relative group w-72 h-84 shrink-0"
                    >
                      <ReleaseCardSm
                        release={{
                          id: r.id,
                          name: r.name,
                          thumbnail: r.thumbnail,
                          primaryArtistName: r.primaryArtistName,
                          featureArtistNames: r.featureArtistNames,
                          artist: r.artist,
                          songCount: r.songCount,
                          kindLabel:
                            r.type === "album" ? "Album" : r.type === "ep" ? "EP" : "Single",
                          spotifyLink: r.spotifyLink,
                          appleMusicLink: r.appleMusicLink,
                          tidalLink: r.tidalLink,
                          amazonMusicLink: r.amazonMusicLink,
                          youtubeLink: r.youtubeLink,
                          soundcloudLink: r.soundcloudLink,
                          isrcExplicit: r.isrcExplicit,
                        }}
                      />
                    </div>
                  ))}
                </div>
                {canScrollRight ? (
                  <button
                    type="button"
                    onClick={() => scrollMore("next")}
                    aria-label="Next"
                    className="flex-shrink-0 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-white/10"
                  >
                    <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="max-w-6xl xl:max-w-7xl mx-auto px-0 pb-10">
            <ReleasePressSection releaseId={releaseId} />
          </div>
        </div>
      </div>
      <Dialog
        open={Boolean(selectedTrack)}
        onOpenChange={(open) => {
          if (!open) setSelectedTrack(null);
        }}
      >
        <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedTrack?.name ?? "Track details"}</DialogTitle>
          </DialogHeader>
          {selectedTrack ? (
            (() => {
              const parsedTrackCredits = parseTrackCredits(selectedTrack.trackCredits);
              const trackFt = getTrackFeatureNames(selectedTrack);
              return (
            <div className="space-y-4">
              <div className="space-y-0.5">
                <p className="text-sm text-white/95 font-medium">
                  {getTrackPrimaryLine(selectedTrack)}
                </p>
                {trackFt.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    ft {trackFt.join(", ")}
                  </p>
                ) : null}
              </div>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(6rem,auto)_1fr]">
                <dt className="text-gray-500">Duration</dt>
                <dd className="text-gray-200">{formatDuration(selectedTrack.duration)}</dd>
                {selectedTrack.composer ? (
                  <>
                    <dt className="text-gray-500">Composer</dt>
                    <dd className="text-gray-200">{selectedTrack.composer}</dd>
                  </>
                ) : null}
                {selectedTrack.lyricist ? (
                  <>
                    <dt className="text-gray-500">Lyricist</dt>
                    <dd className="text-gray-200">{selectedTrack.lyricist}</dd>
                  </>
                ) : null}
                {selectedTrack.leadVocal ? (
                  <>
                    <dt className="text-gray-500">Lead vocal</dt>
                    <dd className="text-gray-200">{selectedTrack.leadVocal}</dd>
                  </>
                ) : null}
              </dl>
              {parsedTrackCredits.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Track credits</h3>
                  <div className="space-y-2 text-sm bg-black/30 border border-white/10 rounded-lg p-3">
                    {parsedTrackCredits.map((credit, idx) => (
                      <div
                        key={`${credit.name}-${credit.role ?? "role"}-${idx}`}
                        className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(8rem,auto)_1fr]"
                      >
                        <p className="text-gray-500">{formatCreditCategory(credit.category)}</p>
                        <p className="text-gray-200">
                          {credit.name}
                          {credit.role ? (
                            <span className="text-gray-400"> - {credit.role}</span>
                          ) : null}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
              );
            })()
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

