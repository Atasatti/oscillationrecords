"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Upload, RotateCcw } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import {
  DEFAULT_PAGE_MEDIA,
  PAGE_IMAGE_FIELDS,
  type PageImageGroup,
  type PageImageKey,
} from "@/lib/page-media-defaults";

async function uploadImage(file: File): Promise<string> {
  const timestamp = Date.now();
  const name = `site/page-media/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const presign = await fetch("/api/upload/presigned-url-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageFileName: name, imageFileType: file.type }),
  });
  if (!presign.ok) {
    const err = await presign.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get upload URL");
  }
  const { uploadURL, fileURL } = (await presign.json()) as {
    uploadURL: string;
    fileURL: string;
  };
  const put = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("Upload failed");
  return fileURL;
}

export default function PageImagesPanel({
  group,
  title,
  description,
}: {
  group: PageImageGroup;
  title: string;
  description?: string;
}) {
  const toast = useToast();
  const fields = PAGE_IMAGE_FIELDS.filter((f) => f.group === group);

  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const anyDirty = Object.values(dirty).some(Boolean);
  useUnsavedChangesGuard(anyDirty);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings/page-media");
        if (res.ok) {
          const media = await res.json();
          if (!cancelled) {
            const next: Record<string, string> = {};
            for (const f of fields) next[f.key] = media[f.key] ?? DEFAULT_PAGE_MEDIA[f.key];
            setValues(next);
          }
        }
      } catch {
        if (!cancelled) toast.error("Could not load current images.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  const setBusyFor = (key: string, v: boolean) =>
    setBusy((p) => ({ ...p, [key]: v }));

  const handlePick = async (key: PageImageKey, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setBusyFor(key, true);
    try {
      const url = await uploadImage(file);
      setValues((p) => ({ ...p, [key]: url }));
      setDirty((p) => ({ ...p, [key]: true }));
      toast.success("Uploaded. Click Save to apply.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusyFor(key, false);
    }
  };

  const save = async (key: PageImageKey) => {
    setBusyFor(key, true);
    try {
      const res = await fetch("/api/admin/site-settings/page-media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: values[key] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setDirty((p) => ({ ...p, [key]: false }));
      toast.success("Saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyFor(key, false);
    }
  };

  const reset = async (key: PageImageKey) => {
    setBusyFor(key, true);
    try {
      const res = await fetch("/api/admin/site-settings/page-media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: "" }),
      });
      if (!res.ok) throw new Error("Reset failed");
      setValues((p) => ({ ...p, [key]: DEFAULT_PAGE_MEDIA[key] }));
      setDirty((p) => ({ ...p, [key]: false }));
      toast.success("Reset to default.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusyFor(key, false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-1 text-lg">{title}</h3>
      {description ? (
        <p className="mb-4 text-xs text-muted-foreground">{description}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => {
          const url = values[f.key] || DEFAULT_PAGE_MEDIA[f.key];
          const isDefault = url === DEFAULT_PAGE_MEDIA[f.key];
          const working = !!busy[f.key];
          return (
            <div
              key={f.key}
              className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{f.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
              </div>
              <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-lg border border-border bg-black/30">
                <Image
                  src={url}
                  alt={f.label}
                  fill
                  className="object-contain"
                  sizes="220px"
                  unoptimized={url.startsWith("/")}
                />
                {isDefault ? (
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    default
                  </span>
                ) : null}
              </div>
              <input
                ref={(el) => {
                  inputRefs.current[f.key] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handlePick(f.key, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={working}
                  onClick={() => inputRefs.current[f.key]?.click()}
                >
                  {working ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload
                </Button>
                {dirty[f.key] ? (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-white text-black hover:bg-gray-200"
                    disabled={working}
                    onClick={() => save(f.key)}
                  >
                    <Save className="h-4 w-4" /> Save
                  </Button>
                ) : null}
                {!isDefault ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={working}
                    onClick={() => reset(f.key)}
                    title="Reset to the built-in default image"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
