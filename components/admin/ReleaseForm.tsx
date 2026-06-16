"use client";
import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Image as ImageIcon, Loader2, Database } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/local-ui/Toast";
import CreditsEditor from "@/components/admin/CreditsEditor";
import { normalizeCredits, type CreditEntry } from "@/lib/credits";
import { buildHarmonyReleaseUrl, canSeedRelease } from "@/lib/musicbrainz-seed";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
  normalizeFeatureArtistNamesInput,
} from "@/lib/release-format";


interface Artist {
  id: string;
  name: string;
}

export type ReleaseFormProps = {
  mode: "create" | "edit";
  releaseKind: "SINGLE" | "EP" | "ALBUM";
  releaseId?: string;
};

export default function ReleaseForm({
  mode,
  releaseKind,
  releaseId,
}: ReleaseFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [loadedKind, setLoadedKind] = useState<
    "SINGLE" | "EP" | "ALBUM" | null
  >(null);

  const [isLoading, setIsLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [loadingRelease, setLoadingRelease] = useState(mode === "edit");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    coverImageFile: null as File | null,
    description: "",
    releaseDate: "",
    primaryGenre: "",
    secondaryGenre: "",
    spotifyLink: "",
    appleMusicLink: "",
    tidalLink: "",
    amazonMusicLink: "",
    youtubeLink: "",
    soundcloudLink: "",
    primaryArtistIds: [] as string[],
    featureArtistText: "",
    isrcExplicit: false,
    upcCode: "",
    catalogueNumber: "",
    pLine: "",
    cLine: "",
  });
  const [credits, setCredits] = useState<CreditEntry[]>([]);

  // Field-level validation errors, shown inline beneath each field so name, date,
  // and artwork all report problems the same way (no mix of native bubbles/toasts).
  const [errors, setErrors] = useState<{
    name?: string;
    coverImage?: string;
    releaseDate?: string;
    primaryArtists?: string;
  }>({});

  const clearError = (field: keyof typeof errors) =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const imageInputRef = useRef<HTMLInputElement>(null);
  // Track the feature line as loaded so we only overwrite feature artists (which
  // would convert linked artists to plain names) when the field actually changes.
  const initialFeatureTextRef = useRef<string>("");
  const hadLinkedFeatureArtistsRef = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/artists");
        if (res.ok) setArtists(await res.json());
      } catch (e) {
        console.error(e);
        toast.error("Failed to fetch artists");
      } finally {
        setLoadingArtists(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !releaseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/releases/${releaseId}`);
        if (!res.ok) {
          toast.error("Failed to load release");
          router.push("/admin/catalog");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const map = buildArtistMap((data.artists || []) as Artist[]);
        const featureLine = combinedFeatureDisplayNames(
          data.featureArtistIds || [],
          data.primaryArtistIds || [],
          map,
          data.featureArtistNames
        ).join(", ");
        initialFeatureTextRef.current = featureLine;
        hadLinkedFeatureArtistsRef.current =
          (data.featureArtistIds || []).length > 0;
        setFormData((prev) => ({
          ...prev,
          name: data.name || "",
          description: data.description || "",
          releaseDate: data.releaseDate
            ? String(data.releaseDate).slice(0, 10)
            : "",
          primaryGenre: data.primaryGenre || "",
          secondaryGenre: data.secondaryGenre || "",
          spotifyLink: data.spotifyLink || "",
          appleMusicLink: data.appleMusicLink || "",
          tidalLink: data.tidalLink || "",
          amazonMusicLink: data.amazonMusicLink || "",
          youtubeLink: data.youtubeLink || "",
          soundcloudLink: data.soundcloudLink || "",
          primaryArtistIds: data.primaryArtistIds || [],
          featureArtistText: featureLine,
          isrcExplicit: Boolean(data.isrcExplicit),
          upcCode: data.upcCode || "",
          catalogueNumber: data.catalogueNumber || "",
          pLine: data.pLine || "",
          cLine: data.cLine || "",
        }));
        setCredits(normalizeCredits(data.credits));
        setCoverImageUrl(data.coverImage || null);
        setImagePreview(data.coverImage || null);
        if (data.kind) setLoadedKind(data.kind as "SINGLE" | "EP" | "ALBUM");
      } catch (e) {
        console.error(e);
        toast.error("Failed to load release");
      } finally {
        if (!cancelled) setLoadingRelease(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, releaseId, router]);

  const handlePrimaryArtistsChange = (selected: string[]) => {
    setFormData((prev) => ({ ...prev, primaryArtistIds: selected }));
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "name" || name === "releaseDate") clearError(name);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prev) => ({ ...prev, coverImageFile: file }));
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      clearError("coverImage");
    }
  };

  const removeImage = () => {
    if (imagePreview && imagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setCoverImageUrl(null);
    setFormData((prev) => ({ ...prev, coverImageFile: null }));
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const uploadFileToS3 = async (file: File, uploadURL: string): Promise<void> => {
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }
  };

  const uploadCoverOnly = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const imageFileName = `releases/images/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const response = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageFileName,
        imageFileType: file.type,
      }),
    });
    if (!response.ok) throw new Error("Failed to get cover upload URL");
    const data = await response.json();
    await uploadFileToS3(file, data.uploadURL);
    return data.fileURL as string;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Field-level validation — collected together so name, artwork, and date all
    // surface inline beneath their field in the same style.
    const fieldErrors: typeof errors = {};

    if (!formData.name?.trim()) {
      fieldErrors.name = "Please enter a release name";
    }

    if (mode === "create" && !formData.coverImageFile) {
      fieldErrors.coverImage = "Please add a cover image";
    } else if (mode === "edit" && !formData.coverImageFile && !coverImageUrl) {
      fieldErrors.coverImage = "Cover image is missing";
    }

    // Block past release dates on create. Edit is exempt so historical releases
    // (which legitimately have past dates) stay editable. Compare as YYYY-MM-DD
    // strings in local time to avoid timezone off-by-one issues.
    if (mode === "create" && formData.releaseDate) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (formData.releaseDate < todayStr) {
        fieldErrors.releaseDate = "Release date can’t be in the past";
      }
    }

    if (formData.primaryArtistIds.length === 0) {
      fieldErrors.primaryArtists = "Select at least one primary artist";
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    if (artists.length === 0) {
      toast.error("No artists available. Create an artist first.");
      return;
    }

    setIsLoading(true);
    try {
      let finalCover: string;
      if (formData.coverImageFile) {
        setUploadingImage(true);
        finalCover = await uploadCoverOnly(formData.coverImageFile);
        setUploadingImage(false);
      } else {
        finalCover = coverImageUrl!;
      }

      const payload: Record<string, unknown> = {
        name: formData.name,
        coverImage: finalCover,
        releaseDate: formData.releaseDate || null,
        description: formData.description || null,
        primaryGenre: formData.primaryGenre || null,
        secondaryGenre: formData.secondaryGenre || null,
        spotifyLink: formData.spotifyLink || null,
        appleMusicLink: formData.appleMusicLink || null,
        tidalLink: formData.tidalLink || null,
        amazonMusicLink: formData.amazonMusicLink || null,
        youtubeLink: formData.youtubeLink || null,
        soundcloudLink: formData.soundcloudLink || null,
        isrcExplicit: formData.isrcExplicit,
        upcCode: formData.upcCode || null,
        catalogueNumber: formData.catalogueNumber || null,
        pLine: formData.pLine || null,
        cLine: formData.cLine || null,
        primaryArtistIds: formData.primaryArtistIds,
        credits: normalizeCredits(credits),
      };

      // Only send feature artists when creating, when the field changed, or when
      // there were no linked feature artists to begin with. Sending it always
      // would convert previously-linked feature artists into plain text on every
      // edit (and drop the release from those artists' pages).
      const featureChanged =
        formData.featureArtistText.trim() !== initialFeatureTextRef.current.trim();
      if (mode === "create" || featureChanged || !hadLinkedFeatureArtistsRef.current) {
        payload.featureArtistNames = normalizeFeatureArtistNamesInput(
          formData.featureArtistText
        );
      }

      if (mode === "create") {
        const res = await fetch("/api/releases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: releaseKind,
            ...payload,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          router.push(`/admin/catalog/release/${created.id}`);
        } else {
          const err = await res.json();
          toast.error(err.error || "Create failed");
        }
      } else {
        const res = await fetch(`/api/releases/${releaseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          router.push(`/admin/catalog/release/${releaseId}`);
        } else {
          const err = await res.json();
          toast.error(err.error || "Update failed");
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsLoading(false);
    }
  };

  const effectiveKind =
    mode === "edit" && loadedKind ? loadedKind : releaseKind;
  const releaseLabel =
    effectiveKind === "SINGLE"
      ? "Single"
      : effectiveKind === "EP"
        ? "EP"
        : "Album";

  if (loadingRelease) {
    return (
      <div className="flex justify-center items-center py-40">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div>
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-4xl font-light tracking-tighter">
              {mode === "edit" ? `Edit ${releaseLabel}` : `Create ${releaseLabel}`}
            </h1>
            {canSeedRelease({
              gtin: formData.upcCode,
              urls: [formData.spotifyLink, formData.appleMusicLink],
            }) ? (
              <Button
                type="button"
                variant="outline"
                title="Open Harmony to import this release into MusicBrainz (review & submit)"
                onClick={() => {
                  const url = buildHarmonyReleaseUrl({
                    gtin: formData.upcCode,
                    urls: [formData.spotifyLink, formData.appleMusicLink],
                  });
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <Database className="h-4 w-4" /> Add to MusicBrainz
              </Button>
            ) : null}
          </div>
          <p className="text-gray-400 mt-2">
            Release details only — add tracks from the release page after saving.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
                <label className="block text-sm font-medium text-gray-300 mb-4">
                  Cover image *
                </label>
                <div className="space-y-4">
                  {imagePreview ? (
                    <div className="relative group">
                      <img
                        src={imagePreview}
                        alt="Cover"
                        className="w-full aspect-square object-cover rounded-lg border border-white/10"
                      />
                      <Button
                        type="button"
                        onClick={removeImage}
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => imageInputRef.current?.click()}
                      className={`w-full aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-600 bg-[#141414]/50 ${
                        errors.coverImage ? "border-red-500/70" : "border-white/10"
                      }`}
                    >
                      <ImageIcon className="w-12 h-12 text-gray-500 mb-3" />
                      <p className="text-sm text-gray-400">Upload cover</p>
                    </div>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  {errors.coverImage && (
                    <p className="text-sm text-red-400">{errors.coverImage}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#141414] rounded-xl p-6 border border-white/10 space-y-4">
                <h3 className="text-lg font-medium text-gray-200">Basic</h3>
                <div>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Release name *"
                    aria-invalid={errors.name ? true : undefined}
                    className={`bg-[#141414] text-white ${
                      errors.name ? "border-red-500/70" : "border-white/10"
                    }`}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-400">{errors.name}</p>
                  )}
                </div>
                <Textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Description"
                  rows={4}
                  className="bg-black/40 border-white/10 text-white resize-none"
                />
                <div>
                  <Input
                    name="releaseDate"
                    type="date"
                    value={formData.releaseDate}
                    onChange={handleInputChange}
                    aria-invalid={errors.releaseDate ? true : undefined}
                    className={`bg-[#141414] text-white ${
                      errors.releaseDate ? "border-red-500/70" : "border-white/10"
                    }`}
                  />
                  {errors.releaseDate && (
                    <p className="mt-1 text-sm text-red-400">{errors.releaseDate}</p>
                  )}
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-gray-400">
                    Explicit *
                  </span>
                  <div className="flex flex-wrap gap-4 pt-1">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                      <input
                        type="radio"
                        name="release-explicit"
                        checked={!formData.isrcExplicit}
                        onChange={() =>
                          setFormData((p) => ({ ...p, isrcExplicit: false }))
                        }
                        className="border-gray-600"
                      />
                      No
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                      <input
                        type="radio"
                        name="release-explicit"
                        checked={formData.isrcExplicit}
                        onChange={() =>
                          setFormData((p) => ({ ...p, isrcExplicit: true }))
                        }
                        className="border-gray-600"
                      />
                      Yes
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-medium text-gray-200 mb-4">Genre</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    name="primaryGenre"
                    value={formData.primaryGenre}
                    onChange={handleInputChange}
                    placeholder="Primary genre"
                    className="bg-black/40 border-white/10 text-white"
                  />
                  <Input
                    name="secondaryGenre"
                    value={formData.secondaryGenre}
                    onChange={handleInputChange}
                    placeholder="Secondary genre (optional)"
                    className="bg-black/40 border-white/10 text-white"
                  />
                </div>
              </div>

              <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-medium text-gray-200 mb-1">Codes &amp; copyright</h3>
                <p className="mb-4 text-xs text-gray-500">
                  Label data from your distributor (Ditto) — stored for your records.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">UPC / barcode</label>
                    <Input
                      name="upcCode"
                      value={formData.upcCode}
                      onChange={handleInputChange}
                      placeholder="e.g. 012345678905"
                      className="bg-black/40 border-white/10 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">Catalogue number</label>
                    <Input
                      name="catalogueNumber"
                      value={formData.catalogueNumber}
                      onChange={handleInputChange}
                      placeholder="e.g. OSC001"
                      className="bg-black/40 border-white/10 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">℗ line (recording)</label>
                    <Input
                      name="pLine"
                      value={formData.pLine}
                      onChange={handleInputChange}
                      placeholder="2024 Oscillation Records"
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">© line (composition)</label>
                    <Input
                      name="cLine"
                      value={formData.cLine}
                      onChange={handleInputChange}
                      placeholder="2024 Oscillation Records"
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-medium text-gray-200 mb-1">Credits</h3>
                <p className="mb-4 text-xs text-gray-500">
                  Release-level credits — producers, songwriters, composers, etc.
                  (per-track credits are set on each track.)
                </p>
                <CreditsEditor value={credits} onChange={setCredits} idPrefix="release-credits" />
              </div>

              <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-medium text-gray-200 mb-4">Streaming</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(
                    [
                      ["spotifyLink", "Spotify"],
                      ["appleMusicLink", "Apple Music"],
                      ["tidalLink", "Tidal"],
                      ["amazonMusicLink", "Amazon Music"],
                      ["youtubeLink", "YouTube"],
                      ["soundcloudLink", "SoundCloud"],
                    ] as const
                  ).map(([k, label]) => (
                    <Input
                      key={k}
                      name={k}
                      value={formData[k]}
                      onChange={handleInputChange}
                      placeholder={label}
                      className="bg-black/40 border-white/10 text-white"
                    />
                  ))}
                </div>
              </div>

              <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-medium text-gray-200 mb-4">Artists *</h3>
                {loadingArtists ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : (
                  <div className="space-y-4">
                    <MultiSelect
                      options={artists.map((a) => ({ value: a.id, label: a.name }))}
                      selected={formData.primaryArtistIds}
                      onChange={(ids) => {
                        handlePrimaryArtistsChange(ids);
                        if (errors.primaryArtists) setErrors((p) => ({ ...p, primaryArtists: undefined }));
                      }}
                      placeholder="Primary artists *"
                    />
                    {errors.primaryArtists ? (
                      <p className="text-sm text-red-400">{errors.primaryArtists}</p>
                    ) : null}
                    <p className="text-xs text-gray-500">Featured (optional)</p>
                    <Input
                      name="featureArtistText"
                      value={formData.featureArtistText}
                      onChange={handleInputChange}
                      placeholder="e.g. Guest Name, Another Artist"
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={isLoading || uploadingImage || artists.length === 0}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  {isLoading || uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {mode === "edit" ? "Save" : "Create release"}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="border-white/10 text-gray-300"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
