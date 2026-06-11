"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Upload } from "lucide-react";
import { DEFAULT_STACKED_HERO_IMAGES } from "@/lib/site-settings-defaults";

type Slot = "image1" | "image2" | "image3";

const LABELS: Record<Slot, string> = {
  image1: "Image 1 (front)",
  image2: "Image 2",
  image3: "Image 3 (back)",
};

export default function StackedHeroImagesAdmin() {
  const [urls, setUrls] = useState<Record<Slot, string>>({
    image1: DEFAULT_STACKED_HERO_IMAGES.image1,
    image2: DEFAULT_STACKED_HERO_IMAGES.image2,
    image3: DEFAULT_STACKED_HERO_IMAGES.image3,
  });
  const [uploadingSlot, setUploadingSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const inputRefs = useRef<Record<Slot, HTMLInputElement | null>>({
    image1: null,
    image2: null,
    image3: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings/stacked-hero");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.image1 && data.image2 && data.image3) {
            setUrls({
              image1: data.image1,
              image2: data.image2,
              image3: data.image3,
            });
          }
        }
      } catch {
        if (!cancelled) setMessage({ type: "err", text: "Could not load current images." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPresignedUrl = async (imageFile: File) => {
    const timestamp = Date.now();
    const imageFileName = `site/stacked-hero/${timestamp}-${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const response = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageFileName,
        imageFileType: imageFile.type,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to get upload URL");
    }
    return response.json() as Promise<{ uploadURL: string; fileURL: string }>;
  };

  const uploadFileToS3 = async (file: File, uploadURL: string) => {
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadResponse.ok) {
      throw new Error("Upload failed");
    }
  };

  const handlePickFile = async (slot: Slot, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      setMessage({ type: "err", text: "Please choose an image file." });
      return;
    }
    setMessage(null);
    setUploadingSlot(slot);
    try {
      const { uploadURL, fileURL } = await getPresignedUrl(file);
      await uploadFileToS3(file, uploadURL);
      setUrls((prev) => ({ ...prev, [slot]: fileURL }));
      setMessage({ type: "ok", text: `${LABELS[slot]} uploaded. Save to apply on the home page.` });
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Upload failed. Check AWS configuration.",
      });
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleSave = async () => {
    const { image1, image2, image3 } = urls;
    if (!image1?.trim() || !image2?.trim() || !image3?.trim()) {
      setMessage({ type: "err", text: "All three images are required." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/site-settings/stacked-hero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image1, image2, image3 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }
      setMessage({ type: "ok", text: "Home hero images saved." });
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Save failed",
      });
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
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Home page</p>
        <h2 className="font-light text-2xl md:text-3xl tracking-tighter mt-1">Stacked hero images</h2>
        <p className="text-gray-400 text-sm mt-2 max-w-2xl mx-auto md:mx-0">
          Three images used in the hero stack (front, middle, back). Defaults are the built-in SVGs until you upload and save. All three are required.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {(["image1", "image2", "image3"] as const).map((slot) => (
          <div
            key={slot}
            className="bg-[#141414] border border-white/10 rounded-xl p-4 flex flex-col gap-3"
          >
            <p className="text-sm font-medium text-white">{LABELS[slot]}</p>
            <div className="relative aspect-square w-full max-w-[280px] mx-auto rounded-lg overflow-hidden bg-[#141414]">
              <Image
                src={urls[slot]}
                alt={LABELS[slot]}
                fill
                className="object-cover"
                sizes="280px"
                unoptimized={urls[slot].startsWith("/")}
              />
            </div>
            <input
              ref={(el) => {
                inputRefs.current[slot] = el;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handlePickFile(slot, e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="border-gray-700 w-full"
              disabled={uploadingSlot !== null}
              onClick={() => inputRefs.current[slot]?.click()}
            >
              {uploadingSlot === slot ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
        <Button
          type="button"
          className="bg-white text-black hover:bg-gray-200 min-w-[160px]"
          onClick={handleSave}
          disabled={saving || uploadingSlot !== null}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save images
            </>
          )}
        </Button>
        {message && (
          <p className={message.type === "ok" ? "text-green-400 text-sm" : "text-red-400 text-sm"}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
