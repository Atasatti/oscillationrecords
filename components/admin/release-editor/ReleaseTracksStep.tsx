"use client";

import { ListMusic } from "lucide-react";
import TracklistEditor from "@/components/admin/release-editor/TracklistEditor";

/**
 * Step 2 of the release workflow — the tracklist is managed right here, inside the
 * step, rather than on a separate page: the full autosaving track editor (audio,
 * per-track artists, features, credits, ISRCs, lyrics, stems, reorder) renders
 * inline via the shared TracklistEditor. The standalone /tracks page uses the same
 * component for deep-links.
 */
export default function ReleaseTracksStep({ releaseId }: { releaseId: string }) {
  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <ListMusic className="h-5 w-5 text-gray-400" /> Tracks
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add, reorder and edit each track — audio, per-track artists, features, credits, ISRCs, lyrics and stems. Changes save automatically.
        </p>
      </div>
      <TracklistEditor releaseId={releaseId} />
    </section>
  );
}
