"use client";

import { useParams, useSearchParams } from "next/navigation";
import TracklistEditor from "@/components/admin/release-editor/TracklistEditor";

/**
 * Standalone tracklist page — the same editor that lives inside the release
 * workflow's Tracks step (components/admin/release-editor/TracklistEditor), kept as
 * a direct/deep-link entry point: "Needs attention" links here with ?isrc=<code> to
 * highlight the tracks sharing that ISRC (or ?isrc=none for tracks with none), and
 * the release list links here from the lyrics column. Details live on /edit.
 */
export default function ReleaseTracksPage() {
  const params = useParams();
  const releaseId = params.releaseId as string;
  const highlightIsrc = useSearchParams().get("isrc");

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl">
      <div className="mb-8">
        {/* No in-page back button — the breadcrumb (Admin › Releases › Edit ›
            Tracks, or › New › Tracks when reached from the new-release flow) is
            the way back to the editor. */}
        <h1 className="text-4xl font-light tracking-tighter">Tracklist</h1>
        <p className="mt-2 text-gray-400">
          Tracks save automatically as you edit them. When they&rsquo;re ready, publish
          or schedule the release below — no need to go back to the details page.
        </p>
      </div>

      <TracklistEditor releaseId={releaseId} highlightIsrc={highlightIsrc} showPublishPanel />
    </div>
  );
}
