"use client";
import { useParams } from "next/navigation";
import ReleaseEditor from "@/components/admin/release-editor/ReleaseEditor";
import ReleaseDeliveryPanel from "@/components/admin/ReleaseDeliveryPanel";
import ReleaseSplitsPanel from "@/components/admin/ReleaseSplitsPanel";
import ReleaseBudgetPanel from "@/components/admin/ReleaseBudgetPanel";
import ReleaseTermsPanel from "@/components/admin/ReleaseTermsPanel";
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
      {/* Release management panels — readiness/delivery, royalty splits, and the
          tasks/pitches/press rollups — below the editor so they're on the surface
          people actually work on. */}
      <div className="mt-16">
        <ReleaseDeliveryPanel releaseId={releaseId} />
        <ReleaseSplitsPanel releaseId={releaseId} />
        <ReleaseBudgetPanel releaseId={releaseId} />
        <ReleaseTermsPanel releaseId={releaseId} />
        <LinkedTasksPanel releaseId={releaseId} />
        <LinkedPitchesPanel releaseId={releaseId} />
        <LinkedPressPanel releaseId={releaseId} />
      </div>
    </>
  );
}
