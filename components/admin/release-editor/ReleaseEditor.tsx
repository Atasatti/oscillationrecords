"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Loader2, Database } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { normalizeCredits, type CreditEntry } from "@/lib/credits";
import { buildHarmonyReleaseUrl, canSeedRelease } from "@/lib/musicbrainz-seed";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
  normalizeFeatureArtistNamesInput,
} from "@/lib/release-format";
import { readError } from "@/lib/release-editor";
import ReleaseDetailsPanel, {
  emptyReleaseDetails,
  type ArtistOption,
  type ReleaseDetailsErrors,
  type ReleaseDetailsValue,
} from "./ReleaseDetailsPanel";
import TrackList from "./TrackList";

export type ReleaseKind = "SINGLE" | "EP" | "ALBUM";

export interface ReleaseEditorProps {
  mode: "create" | "edit";
  releaseKind: ReleaseKind;
  releaseId?: string;
  /** Prefill the primary artist when launched from an artist's catalog row. */
  initialArtistId?: string;
}

export default function ReleaseEditor({
  mode,
  releaseKind,
  releaseId,
  initialArtistId,
}: ReleaseEditorProps) {
  const router = useRouter();
  const toast = useToast();

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [loadingRelease, setLoadingRelease] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loadedKind, setLoadedKind] = useState<ReleaseKind | null>(null);

  const [form, setForm] = useState<ReleaseDetailsValue>(() => {
    const base = emptyReleaseDetails();
    // New releases default to live; the unified surface lets the user flip to
    // Draft/Scheduled explicitly. (Edit loads the saved status below.)
    base.status = mode === "create" ? "RELEASED" : "DRAFT";
    if (initialArtistId) base.primaryArtistIds = [initialArtistId];
    return base;
  });
  const [credits, setCredits] = useState<CreditEntry[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReleaseDetailsErrors>({});
  const [initialTracks, setInitialTracks] = useState<Record<string, unknown>[]>([]);
  const [tracksActive, setTracksActive] = useState(false);

  // Track the feature line as loaded so we only overwrite feature artists (which
  // would convert linked artists to plain names) when the field actually changes.
  const initialFeatureTextRef = useRef<string>("");
  const hadLinkedFeatureArtistsRef = useRef<boolean>(false);

  const patchForm = (patch: Partial<ReleaseDetailsValue>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      if ("name" in patch) delete next.name;
      if ("releaseDate" in patch) delete next.releaseDate;
      if ("primaryArtistIds" in patch) delete next.primaryArtists;
      return next;
    });
  };

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
  }, [toast]);

  useEffect(() => {
    if (mode !== "edit" || !releaseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/releases/${releaseId}`);
        if (!res.ok) {
          toast.error("Failed to load release");
          router.push("/admin/catalog/releases");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const map = buildArtistMap((data.artists || []) as ArtistOption[]);
        const featureLine = combinedFeatureDisplayNames(
          data.featureArtistIds || [],
          data.primaryArtistIds || [],
          map,
          data.featureArtistNames
        ).join(", ");
        initialFeatureTextRef.current = featureLine;
        hadLinkedFeatureArtistsRef.current =
          (data.featureArtistIds || []).length > 0;
        setForm({
          name: data.name || "",
          description: data.description || "",
          status:
            (data.status as ReleaseDetailsValue["status"]) || "RELEASED",
          preSaveUrl: data.preSaveUrl || "",
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
        });
        setCredits(normalizeCredits(data.credits));
        setCoverUrl(data.coverImage || null);
        setImagePreview(data.coverImage || null);
        setInitialTracks(Array.isArray(data.tracks) ? data.tracks : []);
        if (data.kind) setLoadedKind(data.kind as ReleaseKind);
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
  }, [mode, releaseId, router, toast]);

  const onPickImage = (file: File) => {
    setCoverFile(file);
    setImagePreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setErrors((prev) => ({ ...prev, coverImage: undefined }));
  };

  const onRemoveImage = () => {
    setImagePreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setCoverUrl(null);
    setCoverFile(null);
  };

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const uploadCoverOnly = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const imageFileName = `releases/images/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const response = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageFileName, imageFileType: file.type }),
    });
    if (!response.ok) {
      throw new Error(await readError(response, "Failed to get cover upload URL"));
    }
    const data = await response.json();
    const put = await fetch(data.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
    return data.fileURL as string;
  };

  const validate = (): ReleaseDetailsErrors | null => {
    const fieldErrors: ReleaseDetailsErrors = {};
    if (!form.name.trim()) fieldErrors.name = "Please enter a release name";

    if (!coverFile && !coverUrl) {
      fieldErrors.coverImage = "Please add a cover image";
    }

    if (mode === "create" && form.status === "RELEASED" && form.releaseDate) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (form.releaseDate < todayStr) {
        fieldErrors.releaseDate = "Release date can’t be in the past";
      }
    }
    if (form.status === "SCHEDULED" && !form.releaseDate) {
      fieldErrors.releaseDate = "Scheduled releases need a release date";
    }
    if (form.primaryArtistIds.length === 0) {
      fieldErrors.primaryArtists = "Select at least one primary artist";
    }
    return Object.keys(fieldErrors).length ? fieldErrors : null;
  };

  const handleSave = async () => {
    const fieldErrors = validate();
    if (fieldErrors) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    if (artists.length === 0) {
      toast.error("No artists available. Create an artist first.");
      return;
    }
    // Don't publish/schedule while tracks are still uploading or saving — a
    // half-saved tracklist would go live. Saving as DRAFT is always allowed.
    if (form.status !== "DRAFT" && tracksActive) {
      toast.error("Hold on — tracks are still uploading. Try again in a moment.");
      return;
    }

    setSaving(true);
    try {
      let finalCover: string;
      if (coverFile) {
        setUploadingImage(true);
        finalCover = await uploadCoverOnly(coverFile);
        setUploadingImage(false);
      } else {
        finalCover = coverUrl!;
      }

      const payload: Record<string, unknown> = {
        name: form.name,
        coverImage: finalCover,
        releaseDate: form.releaseDate || null,
        description: form.description || null,
        primaryGenre: form.primaryGenre || null,
        secondaryGenre: form.secondaryGenre || null,
        spotifyLink: form.spotifyLink || null,
        appleMusicLink: form.appleMusicLink || null,
        tidalLink: form.tidalLink || null,
        amazonMusicLink: form.amazonMusicLink || null,
        youtubeLink: form.youtubeLink || null,
        soundcloudLink: form.soundcloudLink || null,
        isrcExplicit: form.isrcExplicit,
        status: form.status,
        preSaveUrl: form.preSaveUrl || null,
        upcCode: form.upcCode || null,
        catalogueNumber: form.catalogueNumber || null,
        pLine: form.pLine || null,
        cLine: form.cLine || null,
        primaryArtistIds: form.primaryArtistIds,
        credits: normalizeCredits(credits),
      };

      // Only send feature artists on create, when the field changed, or when there
      // were no linked feature artists to begin with — otherwise an edit would
      // convert previously-linked feature artists into plain text.
      const featureChanged =
        form.featureArtistText.trim() !== initialFeatureTextRef.current.trim();
      if (mode === "create" || featureChanged || !hadLinkedFeatureArtistsRef.current) {
        payload.featureArtistNames = normalizeFeatureArtistNamesInput(
          form.featureArtistText
        );
      }

      if (mode === "create") {
        const res = await fetch("/api/releases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: releaseKind, ...payload }),
        });
        if (!res.ok) {
          toast.error(await readError(res, "Create failed"));
          return;
        }
        const created = await res.json();
        if (form.status === "DRAFT") {
          // Stay in the editor so tracks can be added; refresh resumes here.
          toast.success("Draft saved");
          router.replace(`/admin/catalog/releases/${created.id}/edit`);
        } else {
          router.push(`/admin/catalog/release/${created.id}`);
        }
      } else {
        const res = await fetch(`/api/releases/${releaseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast.error(await readError(res, "Update failed"));
          return;
        }
        if (form.status === "DRAFT") {
          toast.success("Draft saved");
        } else {
          router.push(`/admin/catalog/release/${releaseId}`);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const effectiveKind = mode === "edit" && loadedKind ? loadedKind : releaseKind;
  const releaseLabel =
    effectiveKind === "SINGLE" ? "Single" : effectiveKind === "EP" ? "EP" : "Album";

  const seedable = canSeedRelease({
    gtin: form.upcCode,
    urls: [form.spotifyLink, form.appleMusicLink],
  });

  const saveLabel =
    form.status === "DRAFT"
      ? "Save draft"
      : mode === "edit"
        ? "Save"
        : form.status === "SCHEDULED"
          ? "Schedule release"
          : "Publish release";

  if (loadingRelease) {
    return (
      <div className="flex justify-center items-center py-40">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/catalog/releases")}
          className="mb-4 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to releases
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-4xl font-light tracking-tighter">
            {mode === "edit" ? `Edit ${releaseLabel}` : `Create ${releaseLabel}`}
          </h1>
          {seedable ? (
            <Button
              type="button"
              variant="outline"
              title="Open Harmony to import this release into MusicBrainz (review & submit)"
              onClick={() =>
                window.open(
                  buildHarmonyReleaseUrl({
                    gtin: form.upcCode,
                    urls: [form.spotifyLink, form.appleMusicLink],
                  }),
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              <Database className="h-4 w-4" /> Add to MusicBrainz
            </Button>
          ) : null}
        </div>
        <p className="text-gray-400 mt-2">
          {mode === "edit"
            ? "Edit release details. Manage tracks from the release page."
            : "Release details. After saving you can add the tracklist."}
        </p>
      </div>

      <div className="max-w-4xl">
        <ReleaseDetailsPanel
          value={form}
          onChange={patchForm}
          errors={errors}
          artists={artists}
          loadingArtists={loadingArtists}
          credits={credits}
          onCreditsChange={setCredits}
          imagePreview={imagePreview}
          onPickImage={onPickImage}
          onRemoveImage={onRemoveImage}
        />

        {mode === "edit" && releaseId ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-[#141414] p-6">
            <TrackList
              releaseId={releaseId}
              artists={artists}
              defaultPrimaryArtistIds={form.primaryArtistIds}
              defaultFeatureArtistText={form.featureArtistText}
              requireIsrc={form.status === "RELEASED"}
              initialTracks={initialTracks}
              onActivityChange={setTracksActive}
            />
          </div>
        ) : (
          <p className="mt-8 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
            Save a draft to start adding the tracklist with background uploads.
          </p>
        )}

        <div className="mt-8 flex gap-4">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || uploadingImage || artists.length === 0}
            className="bg-white text-black hover:bg-gray-200"
          >
            {saving || uploadingImage ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {saveLabel}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/catalog/releases")}
            className="border-white/10 text-gray-300"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
