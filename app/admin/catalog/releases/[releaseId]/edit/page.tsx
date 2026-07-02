"use client";
import { useParams } from "next/navigation";
import ReleaseEditor from "@/components/admin/release-editor/ReleaseEditor";
import ReleaseReadinessPanel from "@/components/admin/ReleaseReadinessPanel";
import ReleaseSplitsPanel from "@/components/admin/ReleaseSplitsPanel";
import LinkedTasksPanel from "@/components/admin/LinkedTasksPanel";
import LinkedPitchesPanel from "@/components/admin/LinkedPitchesPanel";
import LinkedPressPanel from "@/components/admin/LinkedPressPanel";

export default function EditReleasePage() {
  const params = useParams();
  const releaseId = params.releaseId as string;

  // Kind is loaded from the release itself in edit mode; SINGLE is just the
  // placeholder until the GET resolves the real kind.
  return (
    <>
      <ReleaseEditor mode="edit" releaseKind="SINGLE" releaseId={releaseId} />
      {/* Release management panels — readiness/delivery, revenue splits, and the
          tasks/pitches/press rollups — below the editor so they're on the surface
          people actually work on. */}
      <div className="mt-16">
        <ReleaseReadinessPanel releaseId={releaseId} />
        <ReleaseSplitsPanel releaseId={releaseId} />
        <LinkedTasksPanel releaseId={releaseId} />
        <LinkedPitchesPanel releaseId={releaseId} />
        <LinkedPressPanel releaseId={releaseId} />
      </div>
    </>
  );
}
