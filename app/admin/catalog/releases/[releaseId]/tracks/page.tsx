"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { buildArtistMap, combinedFeatureDisplayNames } from "@/lib/release-format";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import TrackList from "@/components/admin/release-editor/TrackList";
import PublishReleasePanel from "@/components/admin/release-editor/PublishReleasePanel";
import type {
  ArtistOption,
  ReleaseStatus,
} from "@/components/admin/release-editor/ReleaseDetailsPanel";

/**
 * Dedicated tracklist / upload page (split out of the release editor so albums
 * with many tracks aren't crammed onto the details page). Loads the release for
 * the context TrackList needs (status → ISRC requirement, primary/feature
 * artists as track defaults, live state) and renders the autosaving tracklist.
 * Details live on the sibling /edit page.
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

export default function ReleaseTracksPage() {
  const params = useParams();
  const releaseId = params.releaseId as string;
  const router = useRouter();
  const toast = useToast();

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [release, setRelease] = useState<LoadedRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracksUnsaved, setTracksUnsaved] = useState(false);
  // Signals the tracklist surfaces so the publish panel can gate "go live":
  // an in-flight upload/save (busy) and the saved track count + unresolved issues.
  const [tracksBusy, setTracksBusy] = useState(false);
  const [validity, setValidity] = useState({ trackCount: 0, issueCount: 0 });
  // Registers the unsaved-tracks state so the breadcrumb (the way back to Edit)
  // prompts before discarding. No in-page back button — the breadcrumb is the
  // single, consistent navigation control.
  useUnsavedChangesGuard(tracksUnsaved);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [artistsRes, relRes] = await Promise.all([
          fetch("/api/artists"),
          fetch(`/api/releases/${releaseId}`),
        ]);
        if (artistsRes.ok && !cancelled) {
          setArtists((await artistsRes.json()) as ArtistOption[]);
        }
        if (!relRes.ok) {
          if (!cancelled) {
            toast.error("Failed to load release");
            router.push("/admin/catalog/releases");
          }
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
        const releaseDate = data.releaseDate
          ? String(data.releaseDate).slice(0, 10)
          : null;
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
  }, [releaseId, router, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!release) return null;

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl">
      <div className="mb-8">
        {/* No in-page back button — the breadcrumb (Admin › Releases › Edit ›
            Tracks) is the way back to the editor. */}
        <h1 className="text-4xl font-light tracking-tighter">Tracklist</h1>
        <p className="mt-2 text-gray-400">
          {release.name ? `${release.name} — ` : ""}tracks save automatically as you
          edit them. When they&rsquo;re ready, publish or schedule the release below —
          no need to go back to the details page.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#141414] p-6">
        <TrackList
          releaseId={releaseId}
          artists={artists}
          defaultPrimaryArtistIds={release.primaryArtistIds}
          defaultFeatureArtistText={release.featureArtistText}
          requireIsrc={release.status === "RELEASED"}
          releaseIsLive={release.releaseIsLive}
          initialTracks={release.initialTracks}
          onUnsavedChange={setTracksUnsaved}
          onActivityChange={setTracksBusy}
          onValidityChange={setValidity}
        />
      </div>

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
              ? {
                  ...prev,
                  status,
                  releaseDate,
                  releaseIsLive: releaseIsLiveFrom(status, releaseDate),
                }
              : prev
          )
        }
      />
    </div>
  );
}
