"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";
import { buildArtistMap, combinedFeatureDisplayNames } from "@/lib/release-format";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import TrackList from "@/components/admin/release-editor/TrackList";
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
  const { confirmDiscard } = useUnsavedChangesGuard(tracksUnsaved);

  const detailsHref = `/admin/catalog/releases/${releaseId}/edit`;

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
        <div className="mb-4">
          <Button
            variant="ghost"
            onClick={() => {
              if (confirmDiscard()) router.push(detailsHref);
            }}
            className="-ml-2 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Release details
          </Button>
        </div>
        <h1 className="text-4xl font-light tracking-tighter">Tracklist</h1>
        <p className="mt-2 text-gray-400">
          {release.name ? `${release.name} — ` : ""}tracks save automatically as you
          edit them. A released album only goes live once it has tracks.
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
        />
      </div>
    </div>
  );
}
