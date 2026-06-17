"use client";
import { Loader2, CheckCircle2, AlertCircle, RotateCw } from "lucide-react";
import type { UploadItem } from "./useUploadQueue";

export default function UploadStatusChip({
  item,
  hasFile,
  onRetry,
  readyLabel = "Audio ready",
  emptyLabel = "No audio",
}: {
  item: UploadItem | undefined;
  /** True when the row already has an uploaded file (e.g. existing track). */
  hasFile: boolean;
  onRetry?: () => void;
  readyLabel?: string;
  emptyLabel?: string;
}) {
  if (!item) {
    return hasFile ? (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> {readyLabel}
      </span>
    ) : (
      <span className="text-xs text-gray-500">{emptyLabel}</span>
    );
  }

  if (item.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="max-w-[12rem] truncate" title={item.error}>
          {item.error || "Upload failed"}
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-300 hover:bg-red-950/40"
          >
            <RotateCw className="h-3 w-3" /> Retry
          </button>
        ) : null}
      </span>
    );
  }

  if (item.status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
      </span>
    );
  }

  // queued / presigning / uploading
  const label =
    item.status === "queued"
      ? "Queued…"
      : item.status === "presigning"
        ? "Starting…"
        : `Uploading ${item.progress}%`;
  return (
    <span className="inline-flex min-w-[9rem] items-center gap-2 text-xs text-gray-300">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      <span className="shrink-0">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-white/70 transition-[width]"
          style={{ width: `${item.status === "uploading" ? item.progress : 5}%` }}
        />
      </span>
    </span>
  );
}
