"use client";
import { useParams } from "next/navigation";
import ArtistEditor from "@/components/admin/ArtistEditor";
import LinkedTasksPanel from "@/components/admin/LinkedTasksPanel";
import LinkedPitchesPanel from "@/components/admin/LinkedPitchesPanel";
import LinkedPressPanel from "@/components/admin/LinkedPressPanel";

export default function EditArtistPage() {
  const params = useParams();
  const artistId = params.artistId as string;
  return (
    <>
      <ArtistEditor mode="edit" artistId={artistId} />
      {/* Tasks / pitches / press linked to this artist, on the surface people
          actually work on. */}
      <div className="mt-16">
        <LinkedTasksPanel artistId={artistId} />
        <LinkedPitchesPanel artistId={artistId} />
        <LinkedPressPanel artistId={artistId} />
      </div>
    </>
  );
}
