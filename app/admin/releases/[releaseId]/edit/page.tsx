"use client";
import { useParams } from "next/navigation";
import ReleaseWorkflow from "@/components/admin/release-editor/ReleaseWorkflow";

// The release edit flow is a step-based workflow: Release details, Tracks,
// Budget, Documents/Agreements, and Money & outreach — each its own step
// with a readiness indicator and its own save. (Create still runs through
// ReleaseEditor's details-first flow; the stepper is the edit surface where every
// section exists.)
export default function EditReleasePage() {
  const params = useParams();
  const releaseId = params.releaseId as string;
  return <ReleaseWorkflow releaseId={releaseId} />;
}
