"use client";
import { useParams } from "next/navigation";
import ArtistEditor from "@/components/admin/ArtistEditor";

export default function EditArtistPage() {
  const params = useParams();
  return <ArtistEditor mode="edit" artistId={params.artistId as string} />;
}
