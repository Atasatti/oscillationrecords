"use client";
import { useParams } from "next/navigation";
import PressEditor from "@/components/admin/PressEditor";

export default function EditPressPage() {
  const params = useParams();
  return <PressEditor mode="edit" pressId={params.pressId as string} />;
}
