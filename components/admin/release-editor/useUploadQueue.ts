"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { audioKey, stemsKey, readError } from "@/lib/release-editor";

export type UploadKind = "audio" | "stems";
export type UploadStatus =
  | "queued"
  | "presigning"
  | "uploading"
  | "done"
  | "error";

export interface UploadItem {
  key: string; // `${rowId}:${kind}`
  rowId: string;
  kind: UploadKind;
  fileName: string;
  status: UploadStatus;
  progress: number; // 0..100
  fileURL?: string;
  error?: string;
}

export interface UploadComplete {
  rowId: string;
  kind: UploadKind;
  fileURL: string;
}

const CONCURRENCY = 3;

/**
 * Background upload state machine. Presign via fetch, PUT to S3 via XHR so we get
 * real upload progress. Items run up to {@link CONCURRENCY} at a time; failures
 * are isolated and retryable (re-presigning, since S3 URLs expire).
 */
export function useUploadQueue(onComplete: (c: UploadComplete) => void) {
  const [items, setItemsState] = useState<Record<string, UploadItem>>({});
  const itemsRef = useRef(items);
  const filesRef = useRef<Record<string, File>>({});
  const xhrRef = useRef<Record<string, XMLHttpRequest>>({});
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const setItems = useCallback(
    (updater: (prev: Record<string, UploadItem>) => Record<string, UploadItem>) => {
      setItemsState((prev) => {
        const next = updater(prev);
        itemsRef.current = next;
        return next;
      });
    },
    []
  );

  const patch = useCallback(
    (key: string, p: Partial<UploadItem>) => {
      setItems((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...p } } : prev));
    },
    [setItems]
  );

  const startUpload = useCallback(
    async (key: string) => {
      const file = filesRef.current[key];
      const item = itemsRef.current[key];
      if (!file || !item) return;
      patch(key, { status: "presigning", progress: 0, error: undefined });
      try {
        const ts = Date.now();
        const objectKey =
          item.kind === "audio" ? audioKey(file, ts) : stemsKey(file, ts);
        const res = await fetch("/api/upload/presigned-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioFileName: objectKey,
            audioFileType: file.type || "application/octet-stream",
          }),
        });
        if (!res.ok) throw new Error(await readError(res, "Couldn't start the upload"));
        const data = await res.json().catch(() => null);
        if (!data?.audio?.uploadURL || !data?.audio?.fileURL) {
          throw new Error("The upload service returned an unexpected response.");
        }
        const { uploadURL, fileURL } = data.audio as {
          uploadURL: string;
          fileURL: string;
        };

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current[key] = xhr;
          xhr.open("PUT", uploadURL);
          xhr.setRequestHeader(
            "Content-Type",
            file.type || "application/octet-stream"
          );
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              patch(key, {
                status: "uploading",
                progress: Math.round((e.loaded / e.total) * 100),
              });
            }
          };
          xhr.onload = () => {
            delete xhrRef.current[key];
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
          };
          xhr.onerror = () => {
            delete xhrRef.current[key];
            reject(new Error("Network error during upload"));
          };
          xhr.onabort = () => {
            delete xhrRef.current[key];
            reject(new Error("aborted"));
          };
          patch(key, { status: "uploading", progress: 0 });
          xhr.send(file);
        });

        patch(key, { status: "done", progress: 100, fileURL });
        onCompleteRef.current({ rowId: item.rowId, kind: item.kind, fileURL });
      } catch (err) {
        if (err instanceof Error && err.message === "aborted") return; // cancelled
        patch(key, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [patch]
  );

  // Pump: start queued items up to the concurrency cap. Transitioning a started
  // item to "presigning" synchronously keeps the next pass from double-starting.
  useEffect(() => {
    const values = Object.values(items);
    const active = values.filter(
      (i) => i.status === "presigning" || i.status === "uploading"
    ).length;
    let slots = CONCURRENCY - active;
    if (slots <= 0) return;
    for (const it of values) {
      if (slots <= 0) break;
      if (it.status === "queued") {
        slots -= 1;
        void startUpload(it.key);
      }
    }
  }, [items, startUpload]);

  const enqueue = useCallback(
    (rowId: string, file: File, kind: UploadKind) => {
      const key = `${rowId}:${kind}`;
      filesRef.current[key] = file;
      setItems((prev) => ({
        ...prev,
        [key]: {
          key,
          rowId,
          kind,
          fileName: file.name,
          status: "queued",
          progress: 0,
        },
      }));
    },
    [setItems]
  );

  const retry = useCallback(
    (key: string) => {
      if (!filesRef.current[key]) return;
      patch(key, { status: "queued", progress: 0, error: undefined });
    },
    [patch]
  );

  const cancel = useCallback(
    (key: string) => {
      xhrRef.current[key]?.abort();
      delete xhrRef.current[key];
      delete filesRef.current[key];
      setItems((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setItems]
  );

  const clearRow = useCallback(
    (rowId: string) => {
      for (const kind of ["audio", "stems"] as const) cancel(`${rowId}:${kind}`);
    },
    [cancel]
  );

  const hasActive = Object.values(items).some(
    (i) => i.status === "queued" || i.status === "presigning" || i.status === "uploading"
  );

  return { items, enqueue, retry, cancel, clearRow, hasActive };
}
