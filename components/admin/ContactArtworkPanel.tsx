"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Upload, X, ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import { DEFAULT_PAGE_MEDIA } from "@/lib/page-media-defaults";

// Editor for the Contact page's image collage (the grid beside the form). It's
// an ordered list: the first five images form the left column, the rest the
// right column. Persists to SiteSettings.pageMedia.contactArtworks.
export default function ContactArtworkPanel() {
  const toast = useToast();
  const [photos, setPhotos] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings/page-media");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.contactArtworks)) {
            setPhotos(data.contactArtworks);
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
  }, [toast]);

  const getPresignedUrl = async (file: File) => {
    const name = `site/contact-artwork/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const res = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageFileName: name, imageFileType: file.type }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to get upload URL");
    }
    return res.json() as Promise<{ uploadURL: string; fileURL: string }>;
  };

  const handlePickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      toast.error("Please choose image files.");
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of images) {
        const { uploadURL, fileURL } = await getPresignedUrl(file);
        const put = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!put.ok) throw new Error("Upload failed");
        uploaded.push(fileURL);
      }
      setPhotos((prev) => [...prev, ...uploaded]);
      setDirty(true);
      toast.success(
        `${uploaded.length} image${uploaded.length === 1 ? "" : "s"} added. Save to apply.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (i: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const move = (i: number, dir: -1 | 1) => {
    setPhotos((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-settings/page-media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactArtworks: photos }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setDirty(false);
      toast.success("Contact images saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = () => {
    setPhotos(DEFAULT_PAGE_MEDIA.contactArtworks);
    setDirty(true);
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
      <h3 className="mb-1 text-lg">Contact page images</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        The image collage shown beside the form on the Contact page. The first
        five images form the left column, the rest the right column. Add, reorder
        with the arrows, or remove with ✕ — then Save.
      </p>

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No images — they&apos;ll fall back to the built-in artwork. Upload some below.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background p-2"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black/30">
                <Image
                  src={url}
                  alt={`Contact image ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="220px"
                  unoptimized={url.startsWith("/")}
                />
                <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {i + 1}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move earlier"
                    className="rounded p-1 text-gray-300 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === photos.length - 1}
                    aria-label="Move later"
                    className="rounded p-1 text-gray-300 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="Remove image"
                  className="rounded p-1 text-red-400 hover:bg-red-500/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handlePickFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Add images
        </Button>
        <Button
          type="button"
          className="bg-white text-black hover:bg-gray-200"
          onClick={save}
          disabled={saving || uploading || !dirty}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={resetDefault} disabled={saving || uploading}>
          <RotateCcw className="h-4 w-4" /> Reset to default
        </Button>
      </div>
    </div>
  );
}
