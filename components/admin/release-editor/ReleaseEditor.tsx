"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, Save, Loader2, Database, Eye, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { buildHarmonyReleaseUrl, canSeedRelease } from "@/lib/musicbrainz-seed";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
  normalizeFeatureArtistNamesInput,
} from "@/lib/release-format";
import { readError } from "@/lib/release-editor";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import ReleaseDetailsPanel, {
  emptyReleaseDetails,
  type ArtistOption,
  type ReleaseDetailsErrors,
  type ReleaseDetailsValue,
} from "./ReleaseDetailsPanel";
import ReleaseLinkImport, {
  type ReleaseLinkKey,
  type SpotifyAlbumPick,
} from "./ReleaseLinkImport";
import ReleaseScorePanel from "./ReleaseScorePanel";

export type ReleaseKind = "SINGLE" | "EP" | "ALBUM";

export interface ReleaseEditorProps {
  mode: "create" | "edit";
  releaseKind: ReleaseKind;
  releaseId?: string;
  /** Prefill the primary artist when launched from an artist's catalog row. */
  initialArtistId?: string;
  /** Pre-set status on create (e.g. "SCHEDULED" from the Coming Soon page). */
  initialStatus?: ReleaseDetailsValue["status"];
}

export default function ReleaseEditor({
  mode,
  releaseKind,
  releaseId,
  initialArtistId,
  initialStatus,
}: ReleaseEditorProps) {
  const router = useRouter();
  const toast = useToast();

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [loadingRelease, setLoadingRelease] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loadedKind, setLoadedKind] = useState<ReleaseKind | null>(null);
  // Track count for the live SEO score (the tracklist lives on its own page).
  const [trackCount, setTrackCount] = useState(0);

  const [form, setForm] = useState<ReleaseDetailsValue>(() => {
    const base = emptyReleaseDetails();
    // The status dropdown is the live TARGET only (Released / Scheduled) — Draft
    // is the implicit "not published yet" state, set via Next / "Save as draft",
    // never picked from the dropdown. Default the target to Released (or an
    // explicit initialStatus, e.g. SCHEDULED from the Coming Soon page).
    base.status =
      initialStatus === "SCHEDULED" || initialStatus === "RELEASED" ? initialStatus : "RELEASED";
    if (initialArtistId) base.primaryArtistIds = [initialArtistId];
    return base;
  });
  // Whether the release is currently an unpublished draft (new releases are, and
  // existing ones whose stored status is DRAFT). Drives the primary button label
  // (Publish vs Save) — the dropdown no longer carries the draft state.
  const [isDraft, setIsDraft] = useState(mode === "create");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReleaseDetailsErrors>({});
  // Tracks unsaved release-detail edits (the tracklist lives on its own page and
  // autosaves there). Feeds the guard so Back/Cancel/leave warn about lost edits.
  const [dirty, setDirty] = useState(false);
  const { confirmDiscard } = useUnsavedChangesGuard(dirty);
  // Create-flow "leave" prompt (Save as draft / Discard / Continue editing).
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Track the feature line as loaded so we only overwrite feature artists (which
  // would convert linked artists to plain names) when the field actually changes.
  const initialFeatureTextRef = useRef<string>("");
  const hadLinkedFeatureArtistsRef = useRef<boolean>(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const patchForm = (patch: Partial<ReleaseDetailsValue>) => {
    setDirty(true);
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
        // A stored DRAFT has no live target yet — default the dropdown to Released
        // (the admin picks Released/Scheduled when they publish). isDraft tracks
        // the real stored state for the button labels.
        setIsDraft(data.status === "DRAFT");
        setForm({
          name: data.name || "",
          description: data.description || "",
          status: data.status === "SCHEDULED" ? "SCHEDULED" : "RELEASED",
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
        setCoverUrl(data.coverImage || null);
        setImagePreview(data.coverImage || null);
        setTrackCount(Array.isArray(data.tracks) ? data.tracks.length : 0);
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
    setDirty(true);
    setCoverFile(file);
    setImagePreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setErrors((prev) => ({ ...prev, coverImage: undefined }));
  };

  const onRemoveImage = () => {
    setDirty(true);
    setImagePreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setCoverUrl(null);
    setCoverFile(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPickImage(file);
  };

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Apply imported streaming links — only to fields that are still empty, so an
  // import never clobbers a link the admin already entered.
  const applyImportedLinks = (found: Partial<Record<ReleaseLinkKey, string>>) => {
    const patch: Partial<ReleaseDetailsValue> = {};
    (Object.keys(found) as ReleaseLinkKey[]).forEach((k) => {
      const url = found[k];
      if (url && !form[k].trim()) patch[k] = url;
    });
    if (Object.keys(patch).length) patchForm(patch);
  };

  // Apply a picked Spotify album conservatively: fill the Spotify link, name and
  // date only if empty, and set the cover only when none has been chosen yet.
  const applySpotifyAlbum = (album: SpotifyAlbumPick) => {
    const patch: Partial<ReleaseDetailsValue> = {};
    if (album.spotifyUrl && !form.spotifyLink.trim()) patch.spotifyLink = album.spotifyUrl;
    if (album.name && !form.name.trim()) patch.name = album.name;
    if (
      album.releaseDate &&
      !form.releaseDate.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(album.releaseDate)
    ) {
      patch.releaseDate = album.releaseDate;
    }
    if (Object.keys(patch).length) patchForm(patch);
    if (album.coverUrl && !coverFile && !coverUrl && !imagePreview) {
      setDirty(true);
      setCoverUrl(album.coverUrl);
      setImagePreview(album.coverUrl);
      setErrors((prev) => ({ ...prev, coverImage: undefined }));
    }
  };

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

  const validate = (
    status: ReleaseDetailsValue["status"] = form.status
  ): ReleaseDetailsErrors | null => {
    const fieldErrors: ReleaseDetailsErrors = {};
    // A name is the one thing every release needs (it identifies the draft in the
    // list). Everything else is required only when the release is going live or
    // is scheduled — a DRAFT saves incomplete work to finish later.
    if (!form.name.trim()) fieldErrors.name = "Please enter a release name";

    if (status === "DRAFT") {
      return Object.keys(fieldErrors).length ? fieldErrors : null;
    }

    // Live (RELEASED) / Coming Soon (SCHEDULED): require the full details.
    if (!coverFile && !coverUrl) {
      fieldErrors.coverImage = "Please add a cover image";
    }
    if (form.primaryArtistIds.length === 0) {
      fieldErrors.primaryArtists = "Select at least one primary artist";
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // RELEASED may be backdated (adding an older catalogue release); only
    // SCHEDULED (Coming Soon) is future-only.
    if (status === "SCHEDULED") {
      if (!form.releaseDate) {
        fieldErrors.releaseDate = "Scheduled releases need a future release date";
      } else if (form.releaseDate <= todayStr) {
        fieldErrors.releaseDate = "Scheduled releases must use a future date";
      }
    }
    return Object.keys(fieldErrors).length ? fieldErrors : null;
  };

  const handleSave = async (override?: {
    status?: ReleaseDetailsValue["status"];
    redirectTo?: string;
  }) => {
    // Status to persist (the Cancel dialog forces DRAFT); where to go afterwards.
    const status = override?.status ?? form.status;
    const redirectTo = override?.redirectTo;
    const fieldErrors = validate(status);
    if (fieldErrors) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    if (artists.length === 0) {
      toast.error("No artists available. Create an artist first.");
      return;
    }
    // The tracklist lives on its own page (it autosaves there), so the details
    // form has no track state to check. A live release stays hidden until it has
    // tracks (see publicReleaseWhere), so the status can be set freely here.

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
        preSaveUrl: form.preSaveUrl || null,
        status,
        upcCode: form.upcCode || null,
        catalogueNumber: form.catalogueNumber || null,
        pLine: form.pLine || null,
        cLine: form.cLine || null,
        primaryArtistIds: form.primaryArtistIds,
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
        setDirty(false);
        // New releases are created as drafts and continue to the tracklist. Only a
        // bail-out "Save as draft" (which passes redirectTo to leave for the list)
        // shows the plain "Draft saved" message.
        toast.success(
          redirectTo ? "Draft saved" : "Release created — add the tracklist next."
        );
        if (redirectTo) router.push(redirectTo);
        else router.replace(`/admin/catalog/releases/${created.id}/tracks`);
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
        setDirty(false);
        if (status === "DRAFT") {
          toast.success("Draft saved");
          if (redirectTo) router.push(redirectTo);
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

  const primaryArtistName = artists.find(
    (a) => a.id === form.primaryArtistIds[0]
  )?.name;

  // Create always advances to the tracklist next, saving the release as a draft
  // — so the button reads "Next" and publishing happens later. In edit mode the
  // primary button publishes to the chosen target (Publish / Schedule) when the
  // release is still a draft, or just "Save changes" when it's already live; a
  // separate "Save as draft" keeps/sets the draft state.
  const isCreate = mode === "create";
  const primaryLabel = isCreate
    ? "Next"
    : isDraft
      ? form.status === "SCHEDULED"
        ? "Schedule release"
        : "Publish release"
      : "Save changes";

  // Leaving with unsaved changes — in BOTH create and edit — opens the
  // Save-as-draft / Discard / Continue-editing dialog. (Previously edit mode fell
  // through to a discard-only confirm, so changing the status dropdown then
  // hitting Cancel could lose the edits with no way to keep them as a draft.)
  // Nothing dirty → just leave.
  const requestLeave = () => {
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    router.push("/admin/catalog/releases");
  };

  const discardAndLeave = () => {
    setDirty(false); // release the unsaved-changes guard before navigating
    setLeaveOpen(false);
    router.push("/admin/catalog/releases");
  };

  const saveDraftAndLeave = async () => {
    // Reuse handleSave forced to DRAFT; it navigates to the list on success.
    await handleSave({ status: "DRAFT", redirectTo: "/admin/catalog/releases" });
    // On a validation/network failure handleSave surfaces the error and stays —
    // close the dialog so the form (and any field errors) is visible again.
    setLeaveOpen(false);
  };

  if (loadingRelease) {
    return (
      <div className="flex justify-center items-center py-40">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Live signals for the release Discoverability (SEO) panel — recomputed each
  // render so the score updates as fields change.
  const releaseSignals = {
    hasCover: Boolean(imagePreview),
    descLength: form.description.trim().length,
    genreCount: [form.primaryGenre, form.secondaryGenre].filter((g) => g.trim()).length,
    linkCount: [
      form.spotifyLink,
      form.appleMusicLink,
      form.tidalLink,
      form.amazonMusicLink,
      form.youtubeLink,
      form.soundcloudLink,
    ].filter((u) => u.trim()).length,
    trackCount,
    hasReleaseDate: Boolean(form.releaseDate.trim()),
    hasPrimaryArtist: form.primaryArtistIds.length > 0,
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-4xl font-light tracking-tighter">
            {mode === "edit" ? `Edit ${releaseLabel}` : `Create ${releaseLabel}`}
          </h1>
          {/* All header actions on one row — View release sits with the imports. */}
          <div className="flex flex-wrap gap-2">
            {mode === "edit" && releaseId ? (
              <Button
                type="button"
                variant="outline"
                title="View the completed release (tracklist, streaming links and all)"
                onClick={() => {
                  if (confirmDiscard()) router.push(`/admin/catalog/release/${releaseId}`);
                }}
              >
                <Eye className="w-4 h-4 mr-2" />
                View release
              </Button>
            ) : null}
            <ReleaseLinkImport
              seedName={form.name}
              seedArtist={primaryArtistName}
              links={{
                spotifyLink: form.spotifyLink,
                appleMusicLink: form.appleMusicLink,
                tidalLink: form.tidalLink,
                amazonMusicLink: form.amazonMusicLink,
                youtubeLink: form.youtubeLink,
                soundcloudLink: form.soundcloudLink,
              }}
              onApplyLinks={applyImportedLinks}
              onApplySpotify={applySpotifyAlbum}
            />
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
        </div>
        <p className="text-gray-400 mt-2">
          {mode === "edit"
            ? "Edit release details below. The tracklist saves automatically as you edit it."
            : "Release details. Click “Next” to add the tracklist."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        {/* Sidebar: live SEO score + cover image, sticky */}
        <div>
          <div className="space-y-6 lg:sticky lg:top-6">
            <ReleaseScorePanel signals={releaseSignals} />
            <div className="rounded-xl border border-border bg-card p-6">
              <label className="mb-4 block text-sm font-medium text-muted-foreground">
                Cover image *
              </label>
              <div className="space-y-4">
                {imagePreview ? (
                  <div className="group relative mx-auto w-full max-w-[200px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="Cover"
                      className="aspect-square w-full rounded-lg border border-border object-cover"
                    />
                    <Button
                      type="button"
                      onClick={onRemoveImage}
                      variant="destructive"
                      size="sm"
                      className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className={`mx-auto flex aspect-square w-full max-w-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed hover:border-gray-600 ${
                      errors.coverImage ? "border-red-500/70" : "border-border"
                    }`}
                  >
                    <ImageIcon className="mb-3 h-12 w-12 text-gray-500" />
                    <p className="text-sm text-muted-foreground">Upload cover</p>
                  </button>
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
        </div>

        {/* Main column */}
        <div className="min-w-0">
        <ReleaseDetailsPanel
          value={form}
          onChange={patchForm}
          errors={errors}
          artists={artists}
          loadingArtists={loadingArtists}
        />

        {mode === "edit" && releaseId ? (
          <div className="mt-8 flex flex-col gap-4 rounded-xl border border-white/10 bg-[#141414] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-200">Tracklist</h3>
              <p className="mt-1 text-sm text-gray-400">
                Add and edit each track — audio, per-track artists, features &amp;
                credits — on a dedicated page.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                if (confirmDiscard()) router.push(`/admin/catalog/releases/${releaseId}/tracks`);
              }}
            >
              Manage tracklist
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="mt-8 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
            Click “Next” to create the release — you’ll add the tracklist on the next step.
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-4">
          <Button
            type="button"
            onClick={() => (isCreate ? handleSave({ status: "DRAFT" }) : handleSave())}
            disabled={saving || uploadingImage || artists.length === 0}
            className="bg-white text-black hover:bg-gray-200"
          >
            {saving || uploadingImage ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : isCreate ? (
              <>
                {primaryLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {primaryLabel}
              </>
            )}
          </Button>
          {/* Draft is set via this action, not the status dropdown. */}
          {!isCreate ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave({ status: "DRAFT" })}
              disabled={saving || uploadingImage || artists.length === 0}
              className="border-white/10 text-gray-300"
              title="Keep this release hidden as a draft (no validation on incomplete fields)"
            >
              Save as draft
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={requestLeave}
            className="text-gray-300"
          >
            Cancel
          </Button>
        </div>
        {mode === "edit" ? (
          <p className="mt-3 text-xs text-gray-500">
            This saves the release details. Tracks save automatically as you edit them.
          </p>
        ) : null}
        </div>
      </div>

      <Dialog
        open={leaveOpen}
        onOpenChange={(o) => {
          // Don't let an outside-click/Esc close it mid-save.
          if (!saving && !uploadingImage) setLeaveOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this release?</DialogTitle>
            <DialogDescription>
              Do you want to save this release as a draft or discard it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setLeaveOpen(false)}
              disabled={saving || uploadingImage}
              className="text-gray-300"
            >
              Continue editing
            </Button>
            <Button
              variant="outline"
              onClick={discardAndLeave}
              disabled={saving || uploadingImage}
              className="border-white/10 text-red-300 hover:text-red-200"
            >
              Discard
            </Button>
            <Button
              onClick={saveDraftAndLeave}
              disabled={saving || uploadingImage}
              className="bg-white text-black hover:bg-gray-200"
            >
              {saving || uploadingImage ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save as draft"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
