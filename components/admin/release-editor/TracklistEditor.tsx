"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { buildArtistMap, combinedFeatureDisplayNames } from "@/lib/release-format";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import TrackList from "@/components/admin/release-editor/TrackList";
import PublishReleasePanel from "@/components/admin/release-editor/PublishReleasePanel";
import type { ArtistOption, ReleaseStatus } from "@/components/admin/release-editor/ReleaseDetailsPanel";

/**
 * The full, autosaving tracklist editor for a release — add / reorder / edit each
 * track with audio, per-track artists, features, credits, ISRCs, lyrics and stems.
 * Loads the context TrackList needs (status → ISRC requirement, primary/feature
 * artists as track defaults, live state).
 *
 * Shared surface: rendered inline in the Tracks STEP of the release workflow
 * (ReleaseTracksStep) AND on the standalone deep-link page
 * (app/admin/releases/[id]/tracks). Both edit the same release, so the tracklist
 * is managed inside the step rather than feeling split off from it.
 */
function releaseIsLiveFrom(status: string, releaseDate: string | null): boolean {
  if (status === "RELEASED") return true;
  if (status === "SCHEDULED" && releaseDate) return new Date(releaseDate) <= new Date();
  return false;
}

interface LoadedRelease {
  name: string;
  status: ReleaseStatus;
  releaseDate: string | null;
  primaryArtistIds: string[];
  featureArtistText: string;
  releaseIsLive: boolean;
  initialTracks: Record<string, unknown>[];
}

export default function TracklistEditor({
  releaseId,
  highlightIsrc = null,
  showPublishPanel = false,
}: {
  releaseId: string;
  /** Deep-link: highlight tracks sharing this ISRC ("none" = tracks with no ISRC). */
  highlightIsrc?: string | null;
  /** Show the publish/schedule panel below the list (the standalone page does). */
  showPublishPanel?: boolean;
}) {
  const toast = useToast();
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [release, setRelease] = useState<LoadedRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracksUnsaved, setTracksUnsaved] = useState(false);
  // Signals the tracklist surfaces so the publish panel can gate "go live": an
  // in-flight upload/save (busy) and the saved track count + unresolved issues.
  const [tracksBusy, setTracksBusy] = useState(false);
  const [validity, setValidity] = useState({ trackCount: 0, issueCount: 0 });
  // Register the unsaved-tracks state so the breadcrumb / step nav prompts before
  // discarding a genuinely in-flight edit — tracks otherwise autosave, so normal
  // step switching won't prompt.
  useUnsavedChangesGuard(tracksUnsaved);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [artistsRes, relRes] = await Promise.all([
          fetch("/api/artists"),
          fetch(`/api/releases/${releaseId}`),
        ]);
        if (artistsRes.ok && !cancelled) setArtists((await artistsRes.json()) as ArtistOption[]);
        if (!relRes.ok) {
          if (!cancelled) toast.error("Failed to load release");
          return;
        }
        const data = await relRes.json();
        if (cancelled) return;
        const map = buildArtistMap((data.artists || []) as ArtistOption[]);
        const featureLine = combinedFeatureDisplayNames(
          data.featureArtistIds || [],
          data.primaryArtistIds || [],
          map,
          data.featureArtistNames
        ).join(", ");
        const releaseDate = data.releaseDate ? String(data.releaseDate).slice(0, 10) : null;
        setRelease({
          name: data.name || "",
          status: (data.status as ReleaseStatus) || "DRAFT",
          releaseDate,
          primaryArtistIds: data.primaryArtistIds || [],
          featureArtistText: featureLine,
          releaseIsLive: releaseIsLiveFrom(data.status, releaseDate),
          initialTracks: Array.isArray(data.tracks) ? data.tracks : [],
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error("Failed to load release");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!release) return null;

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-[#141414] p-6">
        <TrackList
          releaseId={releaseId}
          artists={artists}
          defaultPrimaryArtistIds={release.primaryArtistIds}
          defaultFeatureArtistText={release.featureArtistText}
          requireIsrc={release.status === "RELEASED"}
          releaseIsLive={release.releaseIsLive}
          initialTracks={release.initialTracks}
          highlightIsrc={highlightIsrc}
          onUnsavedChange={setTracksUnsaved}
          onActivityChange={setTracksBusy}
          onValidityChange={setValidity}
        />
      </div>

      {showPublishPanel ? (
        <PublishReleasePanel
          releaseId={releaseId}
          status={release.status}
          releaseDate={release.releaseDate}
          trackCount={validity.trackCount}
          issueCount={validity.issueCount}
          busy={tracksBusy}
          unsaved={tracksUnsaved}
          onChanged={({ status, releaseDate }) =>
            setRelease((prev) =>
              prev
                ? { ...prev, status, releaseDate, releaseIsLive: releaseIsLiveFrom(status, releaseDate) }
                : prev
            )
          }
        />
      ) : null}
    </>
  );
}
