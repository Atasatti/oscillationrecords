"use client";
import { useParams } from "next/navigation";
import ReleaseEditor from "@/components/admin/release-editor/ReleaseEditor";

export default function EditReleasePage() {
  const params = useParams();
  const releaseId = params.releaseId as string;

  // Kind is loaded from the release itself in edit mode; SINGLE is just the
  // placeholder until the GET resolves the real kind.
  return <ReleaseEditor mode="edit" releaseKind="SINGLE" releaseId={releaseId} />;
}
