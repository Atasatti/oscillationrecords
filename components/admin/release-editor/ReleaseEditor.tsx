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
import { ArrowLeft, ArrowRight, Save, Loader2, Database, Eye } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { normalizeCredits, type CreditEntry } from "@/lib/credits";
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
import TrackList from "./TrackList";
import ReleaseLinkImport, {
  type ReleaseLinkKey,
  type SpotifyAlbumPick,
} from "./ReleaseLinkImport";

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

/** True when a release is publicly visible together with its tracklist:
 * RELEASED, or a SCHEDULED release whose date has already passed. Used to keep
 * the tracklist autosave from ever leaving a live release empty/partial. */
function releaseIsLiveFrom(
  status: string | null | undefined,
  releaseDate: string | null | undefined
): boolean {
  if (status === "RELEASED") return true;
  if (status === "SCHEDULED" && releaseDate) return new Date(releaseDate) <= new Date();
  return false;
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
  // Whether the release is currently live IN THE DB (not the unsaved form), so an
  // unsaved status change can't trick the tracklist autosave into exposing an
  // empty live release. Set on load and after each successful save.
  const [dbReleaseIsLive, setDbReleaseIsLive] = useState(false);

  const [form, setForm] = useState<ReleaseDetailsValue>(() => {
    const base = emptyReleaseDetails();
    // New releases start as DRAFT so the admin saves first and adds the tracklist
    // before going live — a RELEASED release created here would publish empty
    // (the tracklist UI only exists in edit mode). An explicit initialStatus
    // (e.g. SCHEDULED from Coming Soon) still wins. Edit loads the saved status.
    base.status = mode === "create" ? initialStatus ?? "DRAFT" : "DRAFT";
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
  const [trackInfo, setTrackInfo] = useState({ trackCount: 0, issueCount: 0 });
  // Tracks unsaved release-detail edits. The tracklist autosaves separately, so
  // it reports its own "leaving loses work" state (in-flight/failed save) via
  // onUnsavedChange — both feed the guard so Back/Cancel/leave warn either way.
  const [dirty, setDirty] = useState(false);
  const [tracksUnsaved, setTracksUnsaved] = useState(false);
  const { confirmDiscard } = useUnsavedChangesGuard(dirty || tracksUnsaved);
  // Create-flow "leave" prompt (Save as draft / Discard / Continue editing).
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Track the feature line as loaded so we only overwrite feature artists (which
  // would convert linked artists to plain names) when the field actually changes.
  const initialFeatureTextRef = useRef<string>("");
  const hadLinkedFeatureArtistsRef = useRef<boolean>(false);

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
        setDbReleaseIsLive(
          releaseIsLiveFrom(
            data.status,
            data.releaseDate ? String(data.releaseDate).slice(0, 10) : null
          )
        );
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
    if (!form.name.trim()) fieldErrors.name = "Please enter a release name";

    if (!coverFile && !coverUrl) {
      fieldErrors.coverImage = "Please add a cover image";
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (mode === "create" && status === "RELEASED" && form.releaseDate) {
      if (form.releaseDate < todayStr) {
        fieldErrors.releaseDate = "Release date can’t be in the past";
      }
    }
    if (status === "SCHEDULED") {
      // Coming Soon must be in the future, never a past (or today) date.
      if (!form.releaseDate) {
        fieldErrors.releaseDate = "Scheduled releases need a future release date";
      } else if (form.releaseDate <= todayStr) {
        fieldErrors.releaseDate = "Scheduled releases must use a future date";
      }
    }
    if (form.primaryArtistIds.length === 0) {
      fieldErrors.primaryArtists = "Select at least one primary artist";
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
    // Don't publish/schedule while tracks are still uploading or saving — a
    // half-saved tracklist would go live. Saving as DRAFT is always allowed.
    if (status !== "DRAFT" && tracksActive) {
      toast.error("Hold on — tracks are still uploading. Try again in a moment.");
      return;
    }
    // Going live requires a complete tracklist: at least one track and every
    // track with audio, an artist, and an ISRC. (Scheduled/Coming-Soon doesn't.)
    if (status === "RELEASED") {
      if (mode === "create") {
        // Create mode has no tracklist UI, so a RELEASED release would go live
        // empty. Steer the admin to the draft-first path.
        toast.error("Save as a draft first, then add the tracklist before publishing.");
        return;
      }
      if (trackInfo.trackCount === 0) {
        toast.error("Add at least one track before publishing.");
        return;
      }
      if (trackInfo.issueCount > 0) {
        toast.error(
          `${trackInfo.issueCount} track${trackInfo.issueCount === 1 ? "" : "s"} need audio, an artist, or an ISRC before publishing.`
        );
        return;
      }
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
        preSaveUrl: form.preSaveUrl || null,
        status,
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
        setDirty(false);
        if (status === "DRAFT") {
          toast.success("Draft saved");
          // Leaving via Cancel → "Save as draft" goes to the list; the "Next"
          // button stays in the editor so tracks can be added (refresh resumes here).
          if (redirectTo) router.push(redirectTo);
          else router.replace(`/admin/catalog/releases/${created.id}/edit`);
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
        setDirty(false);
        // Keep the live-tracklist guard in sync with what we just persisted (e.g.
        // demoting RELEASED -> DRAFT must release the hold on tracklist autosave).
        setDbReleaseIsLive(releaseIsLiveFrom(status, form.releaseDate || null));
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

  // In create mode the primary button advances setup ("Next" → save as a draft
  // and move on to the tracklist). Editing an existing draft still reads "Save
  // draft"; the explicit save/discard choice now lives on Cancel.
  const isNext = mode === "create" && form.status === "DRAFT";
  const saveLabel = isNext
    ? "Next"
    : form.status === "DRAFT"
      ? "Save draft"
      : mode === "edit"
        ? "Save"
        : form.status === "SCHEDULED"
          ? "Schedule release"
          : "Publish release";

  // Leaving the create form: prompt to save-as-draft or discard. Edit mode (and
  // a pristine create form) keep the lighter confirmDiscard / direct navigation.
  const requestLeave = () => {
    if (mode === "create" && dirty) {
      setLeaveOpen(true);
      return;
    }
    if (confirmDiscard()) router.push("/admin/catalog/releases");
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

  return (
    <div>
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={requestLeave}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to releases
          </Button>
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
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-4xl font-light tracking-tighter">
            {mode === "edit" ? `Edit ${releaseLabel}` : `Create ${releaseLabel}`}
          </h1>
          <div className="flex flex-wrap gap-2">
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

      <div className="max-w-4xl">
        <ReleaseDetailsPanel
          value={form}
          onChange={patchForm}
          errors={errors}
          artists={artists}
          loadingArtists={loadingArtists}
          credits={credits}
          onCreditsChange={(c) => {
            setDirty(true);
            setCredits(c);
          }}
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
              releaseIsLive={dbReleaseIsLive}
              initialTracks={initialTracks}
              onActivityChange={setTracksActive}
              onUnsavedChange={setTracksUnsaved}
              onValidityChange={setTrackInfo}
            />
          </div>
        ) : (
          <p className="mt-8 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
            Click “Next” to create the release and start adding the tracklist.
          </p>
        )}

        <div className="mt-8 flex gap-4">
          <Button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || uploadingImage || artists.length === 0}
            className="bg-white text-black hover:bg-gray-200"
          >
            {saving || uploadingImage ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : isNext ? (
              <>
                {saveLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
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
            onClick={requestLeave}
            className="border-white/10 text-gray-300"
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
