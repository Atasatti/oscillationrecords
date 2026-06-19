"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Upload, X, ArrowLeft, ArrowRight } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";

export default function StudioPhotosAdmin() {
  const toast = useToast();
  // Staged uploads / reorders / removals are unsaved until "Save photos".
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings/studio-photos");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.photos)) setPhotos(data.photos);
        }
      } catch {
        if (!cancelled) toast.error("Could not load current photos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const getPresignedUrl = async (imageFile: File) => {
    const timestamp = Date.now();
    const imageFileName = `site/studio-photos/${timestamp}-${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const response = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageFileName, imageFileType: imageFile.type }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to get upload URL");
    }
    return response.json() as Promise<{ uploadURL: string; fileURL: string }>;
  };

  const uploadFileToS3 = async (file: File, uploadURL: string) => {
    const res = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!res.ok) throw new Error("Upload failed");
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
        await uploadFileToS3(file, uploadURL);
        uploaded.push(fileURL);
      }
      setPhotos((prev) => [...prev, ...uploaded]);
      setDirty(true);
      toast.success(
        `${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} added. Save to apply on the home page.`
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Upload failed. Check AWS configuration."
      );
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (i: number) => {
    setDirty(true);
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  };

  const move = (i: number, dir: -1 | 1) => {
    setDirty(true);
    setPhotos((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-settings/studio-photos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setDirty(false);
      toast.success("Studio photos saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-14 flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="mt-14 md:mt-16 border-t border-white/10 pt-10 md:pt-12">
      <div className="mb-6 text-center md:text-left">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Home page · top carousel</p>
        <h2 className="font-light text-2xl md:text-3xl tracking-tighter mt-1">Top photo carousel</h2>
        <p className="text-gray-400 text-sm mt-2 max-w-2xl mx-auto md:mx-0">
          The photos shown in the slow-scrolling carousel at the very top of the
          home page — the first thing visitors see. Add as many as you like,
          reorder them, and remove any you don&apos;t want. Until you add your own,
          the built-in Oscillation artwork is shown.
        </p>
      </div>

      {photos.length === 0 ? (
        <p className="text-gray-500 text-sm">No photos yet — upload some below.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="bg-[#141414] border border-white/10 rounded-xl p-2 flex flex-col gap-2"
            >
              <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-[#141414]">
                <Image
                  src={url}
                  alt={`Studio photo ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="240px"
                  unoptimized={url.startsWith("/")}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move left"
                    className="p-1 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === photos.length - 1}
                    aria-label="Move right"
                    className="p-1 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="Remove photo"
                  className="p-1 rounded text-red-400 hover:bg-red-500/10"
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

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
        <Button
          type="button"
          variant="outline"
          className="border-gray-700 min-w-[160px]"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Add photos
            </>
          )}
        </Button>
        <Button
          type="button"
          className="bg-white text-black hover:bg-gray-200 min-w-[160px]"
          onClick={handleSave}
          disabled={saving || uploading}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save photos
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
