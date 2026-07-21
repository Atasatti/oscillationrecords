"use client";
import { useParams } from "next/navigation";
import PressEditor from "@/components/admin/PressEditor";

export default function EditPressPage() {
  const params = useParams();
  const pressId = params.pressId as string;
  // Key on the id so navigating straight from one press item to another mounts a
  // fresh editor (resetting form/baseline/errors) instead of reusing the previous
  // item's instance and its state.
  return <PressEditor key={pressId} mode="edit" pressId={pressId} />;
}
