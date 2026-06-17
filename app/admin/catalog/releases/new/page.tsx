"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReleaseEditor, { type ReleaseKind } from "@/components/admin/release-editor/ReleaseEditor";

function toKind(value: string | null): ReleaseKind {
  const v = (value || "").toLowerCase();
  return v === "album" ? "ALBUM" : v === "ep" ? "EP" : "SINGLE";
}

function NewReleaseInner() {
  const params = useSearchParams();
  return (
    <ReleaseEditor
      mode="create"
      releaseKind={toKind(params.get("kind"))}
      initialArtistId={params.get("artistId") || undefined}
    />
  );
}

export default function NewReleasePage() {
  return (
    <Suspense fallback={null}>
      <NewReleaseInner />
    </Suspense>
  );
}
