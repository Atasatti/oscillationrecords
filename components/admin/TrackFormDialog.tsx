"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import { Loader2, Music } from "lucide-react";
import { normalizeFeatureArtistNamesInput } from "@/lib/release-format";
import { readError } from "@/lib/release-editor";
import { useToast } from "@/components/local-ui/Toast";

type ArtistOpt = { id: string; name: string };

type CreditCategory =
  | "composer"
  | "songwriter"
  | "production_engineer"
  | "performer"
  | "custom";

export type TrackFormDialogTrack = {
  id: string;
  name: string;
  image?: string | null;
  audioFile: string;
  duration: number;
  releaseDate?: string | null;
  composer?: string | null;
  lyricist?: string | null;
  leadVocal?: string | null;
  lyrics?: string | null;
  stemsFile?: string | null;
  trackCredits?: TrackCreditJsonRow[] | null;
  isrcCode?: string | null;
  iswc?: string | null;
  isrcExplicit?: boolean;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames?: string[];
};

/** Row as stored in DB JSON */
type TrackCreditJsonRow = {
  category: CreditCategory | "other";
  name: string;
  role: string;
};

const SONGWRITER_ROLES = [
  "Arranger",
  "Author",
  "Conductor",
  "Librettist",
  "Lyricist",
];
const PRODUCTION_ROLES = [
  "Assistant Producer",
  "Mastering Engineer",
  "Mixing Engineer",
  "Musical Director",
  "Producer",
  "Sound Engineer",
];
const PERFORMER_ROLES = [
  "Acoustic Guitar",
  "Alto Saxophone",
  "Background Vocals",
  "Banjo",
  "Baritone Saxophone",
  "Bass Clarinet",
  "Bass Guitar",
  "Bass Trombone",
  "Bassoon",
  "Bongos",
  "Bouzouki",
  "Cello",
  "Choir",
  "Chorus",
  "Clarinet",
  "Classical Guitar",
  "Congas",
  "Cornet",
  "DJ",
  "Djembe",
  "Double Bass",
  "Drums",
  "Electric Guitar",
  "Fiddle",
  "First Violin",
  "Flugelhorn",
  "Flute",
  "Guitar",
  "Hammond Organ",
  "Harmonica",
  "Harmony Vocals",
  "Harp",
  "Harpsichord",
  "Keyboards",
  "Kora",
  "Lead Guitar",
  "Lead Vocals",
  "Mandolin",
  "Mezzo-soprano Vocals",
  "Oboe",
  "Organ",
  "Pedal Steel Guitar",
  "Percussion",
  "Performer",
  "Piano",
  "Piccolo",
  "Remixer",
  "Rhodes Piano",
  "Rhythm Guitar",
  "Saxophone",
  "Second Violin",
  "Sitar",
  "Sopranino Saxophone",
  "Tabla",
  "Tambourine",
  "Tenor Saxophone",
  "Timbales",
  "Timpani",
  "Trombone",
  "Trumpet",
  "Tuba",
  "Ukulele",
  "Viola",
  "Violin",
];

type NameRoleRow = { name: string; role: string };

function creditPayload(
  composerNames: string[],
  songwriterRows: NameRoleRow[],
  productionRows: NameRoleRow[],
  performerRows: NameRoleRow[],
  customRows: NameRoleRow[]
): TrackCreditJsonRow[] {
  const out: TrackCreditJsonRow[] = [];
  for (const name of composerNames) {
    const n = name.trim();
    if (n) out.push({ category: "composer", name: n, role: "" });
  }
  for (const r of songwriterRows) {
    if (r.name.trim() && r.role.trim()) {
      out.push({ category: "songwriter", name: r.name.trim(), role: r.role.trim() });
    }
  }
  for (const r of productionRows) {
    if (r.name.trim() && r.role.trim()) {
      out.push({
        category: "production_engineer",
        name: r.name.trim(),
        role: r.role.trim(),
      });
    }
  }
  for (const r of performerRows) {
    if (r.name.trim() && r.role.trim()) {
      out.push({ category: "performer", name: r.name.trim(), role: r.role.trim() });
    }
  }
  for (const r of customRows) {
    if (r.name.trim() && r.role.trim()) {
      out.push({ category: "custom", name: r.name.trim(), role: r.role.trim() });
    }
  }
  return out;
}

function parseStoredCredits(
  raw: unknown,
  legacy: { composer?: string | null; lyricist?: string | null; leadVocal?: string | null }
): {
  composerNames: string[];
  songwriterRows: NameRoleRow[];
  productionRows: NameRoleRow[];
  performerRows: NameRoleRow[];
  customRows: NameRoleRow[];
} {
  const composerNames: string[] = [];
  const songwriterRows: NameRoleRow[] = [];
  const productionRows: NameRoleRow[] = [];
  const performerRows: NameRoleRow[] = [];
  const customRows: NameRoleRow[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const category = String(row.category || "");
      const name = String(row.name || "").trim();
      const role = String(row.role || "").trim();
      if (category === "composer" && name) {
        composerNames.push(name);
        continue;
      }
      if (category === "songwriter") {
        songwriterRows.push({ name, role });
        continue;
      }
      if (category === "production_engineer") {
        productionRows.push({ name, role });
        continue;
      }
      if (category === "performer") {
        performerRows.push({ name, role });
        continue;
      }
      if (category === "custom" || category === "other") {
        customRows.push({ name, role });
      }
    }
  }

  if (composerNames.length === 0 && legacy.composer?.trim()) {
    composerNames.push(legacy.composer.trim());
  }
  if (songwriterRows.length === 0 && legacy.lyricist?.trim()) {
    songwriterRows.push({ name: legacy.lyricist.trim(), role: "Lyricist" });
  }
  if (performerRows.length === 0 && legacy.leadVocal?.trim()) {
    performerRows.push({ name: legacy.leadVocal.trim(), role: "Lead Vocals" });
  }

  const ensured = (rows: NameRoleRow[]) => (rows.length > 0 ? rows : [{ name: "", role: "" }]);
  return {
    composerNames: composerNames.length > 0 ? composerNames : [""],
    songwriterRows: ensured(songwriterRows),
    productionRows: ensured(productionRows),
    performerRows: ensured(performerRows),
    customRows,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releaseId: string;
  /** Parent release status — audio/ISRC are only required once RELEASED. */
  releaseStatus?: "DRAFT" | "SCHEDULED" | "RELEASED";
  artists: ArtistOpt[];
  defaultPrimaryIds: string[];
  /** Prefill featured line when adding a track (e.g. from release-level credits). */
  defaultFeatureArtistText?: string;
  mode: "create" | "edit";
  track?: TrackFormDialogTrack | null;
  onSaved: () => void;
};

export default function TrackFormDialog({
  open,
  onOpenChange,
  releaseId,
  releaseStatus = "RELEASED",
  artists,
  defaultPrimaryIds,
  defaultFeatureArtistText = "",
  mode,
  track,
  onSaved,
}: Props) {
  // Audio + ISRC are mandatory only once a release is live; a SCHEDULED/DRAFT
  // release may not have them yet.
  const requireAudioIsrc = releaseStatus === "RELEASED";
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [calcDuration, setCalcDuration] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const audRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [isrcCode, setIsrcCode] = useState("");
  const [iswc, setIswc] = useState("");
  const [stemsFile, setStemsFile] = useState<File | null>(null);
  const [stemsUrl, setStemsUrl] = useState("");
  const [uploadingStems, setUploadingStems] = useState(false);
  const stemsRef = useRef<HTMLInputElement>(null);

  const [composerNames, setComposerNames] = useState<string[]>([""]);
  const [songwriterRows, setSongwriterRows] = useState<NameRoleRow[]>([
    { name: "", role: "" },
  ]);
  const [productionRows, setProductionRows] = useState<NameRoleRow[]>([
    { name: "", role: "" },
  ]);
  const [performerRows, setPerformerRows] = useState<NameRoleRow[]>([
    { name: "", role: "" },
  ]);
  const [customRows, setCustomRows] = useState<NameRoleRow[]>([]);

  const [isrcExplicit, setIsrcExplicit] = useState(false);
  const [spotifyLink, setSpotifyLink] = useState("");
  const [appleMusicLink, setAppleMusicLink] = useState("");
  const [tidalLink, setTidalLink] = useState("");
  const [amazonMusicLink, setAmazonMusicLink] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [soundcloudLink, setSoundcloudLink] = useState("");
  const [primaryArtistIds, setPrimaryArtistIds] = useState<string[]>([]);
  const [featureArtistText, setFeatureArtistText] = useState("");
  const [errors, setErrors] = useState<{
    name?: string;
    audio?: string;
    isrc?: string;
    artists?: string;
  }>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (mode === "edit" && track) {
      setName(track.name);
      const parsed = parseStoredCredits(track.trackCredits, {
        composer: track.composer,
        lyricist: track.lyricist,
        leadVocal: track.leadVocal,
      });
      setComposerNames(parsed.composerNames);
      setSongwriterRows(parsed.songwriterRows);
      setProductionRows(parsed.productionRows);
      setPerformerRows(parsed.performerRows);
      setCustomRows(parsed.customRows);
      setLyrics(track.lyrics || "");
      setIsrcCode(track.isrcCode || "");
      setIswc(track.iswc || "");
      setStemsUrl(track.stemsFile || "");
      setIsrcExplicit(Boolean(track.isrcExplicit));
      setSpotifyLink(track.spotifyLink || "");
      setAppleMusicLink(track.appleMusicLink || "");
      setTidalLink(track.tidalLink || "");
      setAmazonMusicLink(track.amazonMusicLink || "");
      setYoutubeLink(track.youtubeLink || "");
      setSoundcloudLink(track.soundcloudLink || "");
      setPrimaryArtistIds(track.primaryArtistIds || []);
      setFeatureArtistText(
        (track.featureArtistNames || []).filter(Boolean).join(", ") ||
          (track.featureArtistIds || [])
            .map((id) => artists.find((a) => a.id === id)?.name)
            .filter(Boolean)
            .join(", ")
      );
      setDuration(track.duration);
      setAudioFile(null);
    } else {
      setName("");
      setComposerNames([""]);
      setSongwriterRows([{ name: "", role: "" }]);
      setProductionRows([{ name: "", role: "" }]);
      setPerformerRows([{ name: "", role: "" }]);
      setCustomRows([]);
      setLyrics("");
      setIsrcCode("");
      setStemsUrl("");
      setIsrcExplicit(false);
      setSpotifyLink("");
      setAppleMusicLink("");
      setTidalLink("");
      setAmazonMusicLink("");
      setYoutubeLink("");
      setSoundcloudLink("");
      setPrimaryArtistIds([...defaultPrimaryIds]);
      setFeatureArtistText(defaultFeatureArtistText.trim());
      setDuration(0);
      setAudioFile(null);
      setStemsFile(null);
    }
  }, [open, mode, track, defaultPrimaryIds, defaultFeatureArtistText, artists]);

  const uploadS3 = async (file: File, url: string) => {
    const r = await fetch(url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!r.ok) throw new Error("Upload failed");
  };

  const uploadAudio = async (file: File): Promise<string> => {
    const ts = Date.now();
    const key = `tracks/audio/${ts}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const res = await fetch("/api/upload/presigned-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioFileName: key, audioFileType: file.type }),
    });
    if (!res.ok) throw new Error(await readError(res, "Couldn't start the audio upload"));
    const data = await res.json().catch(() => null);
    if (!data?.audio?.uploadURL || !data?.audio?.fileURL) {
      throw new Error("The upload service returned an unexpected response.");
    }
    await uploadS3(file, data.audio.uploadURL);
    return data.audio.fileURL as string;
  };

  const uploadStems = async (file: File): Promise<string> => {
    const ts = Date.now();
    const key = `tracks/stems/${ts}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const res = await fetch("/api/upload/presigned-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioFileName: key,
        audioFileType: file.type || "application/octet-stream",
      }),
    });
    if (!res.ok) throw new Error(await readError(res, "Couldn't start the stems upload"));
    const data = await res.json().catch(() => null);
    if (!data?.audio?.uploadURL || !data?.audio?.fileURL) {
      throw new Error("The upload service returned an unexpected response.");
    }
    await uploadS3(file, data.audio.uploadURL);
    return data.audio.fileURL as string;
  };

  const onPickAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject non-audio files (e.g. a video) with a clear message instead of a
    // cryptic failure later on. Accept by MIME type or known audio extension
    // (some valid files report an empty type).
    const isAudio =
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|flac|m4a|aac|ogg|oga|aif|aiff|alac)$/i.test(file.name);
    if (file.type.startsWith("video/") || !isAudio) {
      toast.error("Please choose an audio file (MP3, WAV, FLAC, etc.). Video and other file types aren't supported.");
      e.target.value = "";
      return;
    }
    setErrors((p) => ({ ...p, audio: undefined }));

    setAudioFile(file);
    setCalcDuration(true);
    const audio = new Audio();
    const u = URL.createObjectURL(file);
    audio.src = u;
    try {
      await new Promise<void>((resolve, reject) => {
        audio.onloadedmetadata = () => {
          setDuration(Math.floor(audio.duration));
          URL.revokeObjectURL(u);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(u);
          reject(new Error("Audio load failed"));
        };
      });
    } catch {
      toast.error("Could not read audio duration");
    } finally {
      setCalcDuration(false);
    }
  };

  const onPickStems = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStemsFile(file);
  };

  const handlePrimary = (selected: string[]) => {
    setPrimaryArtistIds(selected);
    if (selected.length) setErrors((p) => ({ ...p, artists: undefined }));
  };

  // Credits are optional. We don't require any rows — we only flag a row that's
  // half-filled (a name without a role, or a role without a name).
  const validateNameRoleRows = (
    rows: NameRoleRow[],
    label: string
  ): boolean => {
    for (const r of rows) {
      const hasName = Boolean(r.name.trim());
      const hasRole = Boolean(r.role.trim());
      if (hasName !== hasRole) {
        toast.error(`${label}: each row needs both name and role (or leave both blank)`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Collect all missing required fields at once so each shows inline next to
    // its field, rather than one toast at a time.
    const fieldErrors: typeof errors = {};
    if (!name.trim()) fieldErrors.name = "Track name is required";
    if (primaryArtistIds.length === 0) fieldErrors.artists = "Select at least one primary artist";
    if (mode === "create") {
      if (!audioFile) fieldErrors.audio = "Add an audio file (MP3 or WAV)";
      else if (duration <= 0) fieldErrors.audio = "Couldn't read the audio length — re-pick the file";
    } else if (!audioFile && !track?.audioFile) {
      fieldErrors.audio = "Audio is missing";
    }
    // ISRC is only required once the release is live (it often arrives later).
    if (requireAudioIsrc && !isrcCode.trim()) fieldErrors.isrc = "ISRC is required";

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});

    // Credits (composer / songwriter / production / performer) are all optional.
    if (!validateNameRoleRows(songwriterRows, "Songwriter")) return;
    if (!validateNameRoleRows(productionRows, "Production / Engineer")) return;
    if (!validateNameRoleRows(performerRows, "Performer")) return;
    for (const r of customRows) {
      const hasName = Boolean(r.name.trim());
      const hasRole = Boolean(r.role.trim());
      if (hasName !== hasRole) {
        toast.error('Additional credits: each "Add more" row needs both name and role');
        return;
      }
    }

    const trackCreditsPayload = creditPayload(
      composerNames,
      songwriterRows,
      productionRows,
      performerRows,
      customRows
    );
    const composerJoined =
      composerNames.map((n) => n.trim()).filter(Boolean).join(", ") || null;

    setSaving(true);
    try {
      let audioUrl = track?.audioFile ?? "";
      if (audioFile) {
        setUploadingAudio(true);
        audioUrl = await uploadAudio(audioFile);
        setUploadingAudio(false);
      }
      let finalStemsUrl = stemsUrl || "";
      if (stemsFile) {
        setUploadingStems(true);
        finalStemsUrl = await uploadStems(stemsFile);
        setUploadingStems(false);
      }

      const body = {
        name: name.trim(),
        image: mode === "edit" ? track?.image ?? null : null,
        audioFile: audioUrl,
        duration,
        releaseDate: null,
        composer: composerJoined,
        lyricist: null,
        leadVocal: null,
        lyrics: lyrics.trim() || null,
        stemsFile: finalStemsUrl || null,
        trackCredits: trackCreditsPayload,
        isrcCode: isrcCode.trim(),
        iswc: iswc.trim() || null,
        isrcExplicit,
        spotifyLink: spotifyLink.trim() || null,
        appleMusicLink: appleMusicLink.trim() || null,
        tidalLink: tidalLink.trim() || null,
        amazonMusicLink: amazonMusicLink.trim() || null,
        youtubeLink: youtubeLink.trim() || null,
        soundcloudLink: soundcloudLink.trim() || null,
        primaryArtistIds,
        featureArtistNames: normalizeFeatureArtistNamesInput(featureArtistText),
      };

      if (mode === "create") {
        const res = await fetch(`/api/releases/${releaseId}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(await readError(res, "Failed to create track"));
        }
      } else if (track) {
        const res = await fetch(`/api/tracks/${track.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(await readError(res, "Failed to update track"));
        }
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUploadingStems(false);
      setSaving(false);
    }
  };

  const updateNamedRow = (
    setter: React.Dispatch<React.SetStateAction<NameRoleRow[]>>,
    index: number,
    patch: Partial<NameRoleRow>
  ) => {
    setter((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const roleSelect = (
    value: string,
    onChange: (v: string) => void,
    options: string[],
    id: string
  ) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm"
    >
      <option value="">Select role *</option>
      {options.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="no-scrollbar max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#141414] text-white">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add track" : "Edit track"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Track name *
            </label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
              }}
              placeholder="Track name"
              className={`border-white/10 bg-black/40 ${errors.name ? "border-red-500/70" : ""}`}
            />
            {errors.name ? <p className="mt-1 text-sm text-red-400">{errors.name}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Track audio (WAV / MP3) *
            </label>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => audRef.current?.click()}
              disabled={calcDuration}
            >
              <Music className="mr-2 h-4 w-4" />
              Choose audio file
            </Button>
            <input
              ref={audRef}
              type="file"
              accept="audio/*,.wav,.mp3"
              className="hidden"
              onChange={onPickAudio}
            />
            {audioFile ? (
              <p className="mt-1 text-xs text-gray-400">{audioFile.name}</p>
            ) : mode === "edit" && track ? (
              <p className="mt-1 text-xs text-gray-400">
                Audio on file — choose a new file to replace
              </p>
            ) : null}
            <p className="mt-1 text-xs text-gray-500">
              Duration:{" "}
              {duration > 0
                ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
                : "—"}
              {calcDuration ? " (reading…)" : ""}
            </p>
            {errors.audio ? <p className="mt-1 text-sm text-red-400">{errors.audio}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Lyrics
            </label>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Lyrics"
              className="border-white/10 bg-black/40"
              rows={4}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Stems
            </label>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => stemsRef.current?.click()}
            >
              Upload stems
            </Button>
            <input
              ref={stemsRef}
              type="file"
              className="hidden"
              onChange={onPickStems}
            />
            {stemsFile ? (
              <p className="mt-1 text-xs text-gray-400">{stemsFile.name}</p>
            ) : stemsUrl ? (
              <p className="mt-1 text-xs text-gray-500">Stems on file</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                ISRC *
              </label>
              <Input
                value={isrcCode}
                onChange={(e) => {
                  setIsrcCode(e.target.value);
                  if (errors.isrc) setErrors((p) => ({ ...p, isrc: undefined }));
                }}
                placeholder="ISRC"
                className={`border-white/10 bg-black/40 font-mono text-sm ${errors.isrc ? "border-red-500/70" : ""}`}
              />
              {errors.isrc ? <p className="mt-1 text-sm text-red-400">{errors.isrc}</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                ISWC
              </label>
              <Input
                value={iswc}
                onChange={(e) => setIswc(e.target.value)}
                placeholder="e.g. T3125086393"
                className="border-white/10 bg-black/40 font-mono text-sm"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-400">
                Explicit *
              </span>
              <div className="flex flex-wrap gap-4 pt-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name="track-explicit"
                    checked={!isrcExplicit}
                    onChange={() => setIsrcExplicit(false)}
                    className="border-gray-600"
                  />
                  No
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name="track-explicit"
                    checked={isrcExplicit}
                    onChange={() => setIsrcExplicit(true)}
                    className="border-gray-600"
                  />
                  Yes
                </label>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-300">Track URLs</p>
            <div className="space-y-2">
              <Input
                value={spotifyLink}
                onChange={(e) => setSpotifyLink(e.target.value)}
                placeholder="Spotify"
                className="border-white/10 bg-black/40"
              />
              <Input
                value={tidalLink}
                onChange={(e) => setTidalLink(e.target.value)}
                placeholder="Tidal"
                className="border-white/10 bg-black/40"
              />
              <Input
                value={appleMusicLink}
                onChange={(e) => setAppleMusicLink(e.target.value)}
                placeholder="Apple Music"
                className="border-white/10 bg-black/40"
              />
              <Input
                value={amazonMusicLink}
                onChange={(e) => setAmazonMusicLink(e.target.value)}
                placeholder="Amazon Music"
                className="border-white/10 bg-black/40"
              />
              <Input
                value={youtubeLink}
                onChange={(e) => setYoutubeLink(e.target.value)}
                placeholder="YouTube"
                className="border-white/10 bg-black/40"
              />
              <Input
                value={soundcloudLink}
                onChange={(e) => setSoundcloudLink(e.target.value)}
                placeholder="SoundCloud"
                className="border-white/10 bg-black/40"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-gray-400">Artists *</p>
            <MultiSelect
              options={artists.map((a) => ({ value: a.id, label: a.name }))}
              selected={primaryArtistIds}
              onChange={handlePrimary}
              placeholder="Primary artist"
            />
            {errors.artists ? <p className="mt-1 text-sm text-red-400">{errors.artists}</p> : null}
            <div className="h-2" />
            <p className="mb-1 text-xs text-gray-500">Featured (optional)</p>
            <Input
              value={featureArtistText}
              onChange={(e) => setFeatureArtistText(e.target.value)}
              placeholder="e.g. Guest Name, Another Artist"
              className="border-white/10 bg-black/40"
            />
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-white">
              Track credits{" "}
              <span className="font-normal text-gray-500">(optional)</span>
            </p>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Composer
              </p>
              {composerNames.map((cn, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={cn}
                    onChange={(e) =>
                      setComposerNames((prev) =>
                        prev.map((c, i) => (i === idx ? e.target.value : c))
                      )
                    }
                    placeholder="Name *"
                    className="border-white/10 bg-black/40"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 text-red-400 hover:text-red-300"
                    onClick={() =>
                      setComposerNames((prev) =>
                        prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10"
                onClick={() => setComposerNames((prev) => [...prev, ""])}
              >
                Add composer
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Songwriter
              </p>
              {songwriterRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 border-b border-white/10/80 pb-3 md:grid-cols-12"
                >
                  <Input
                    className="border-white/10 bg-black/40 md:col-span-5"
                    value={row.name}
                    onChange={(e) =>
                      updateNamedRow(setSongwriterRows, idx, {
                        name: e.target.value,
                      })
                    }
                    placeholder="Name *"
                  />
                  <div className="md:col-span-5">
                    {roleSelect(
                      row.role,
                      (v) => updateNamedRow(setSongwriterRows, idx, { role: v }),
                      SONGWRITER_ROLES,
                      `sw-role-${idx}`
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 md:col-span-2"
                    onClick={() =>
                      setSongwriterRows((prev) =>
                        prev.length > 1
                          ? prev.filter((_, i) => i !== idx)
                          : prev
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10"
                onClick={() =>
                  setSongwriterRows((prev) => [...prev, { name: "", role: "" }])
                }
              >
                Add songwriter
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Production / Engineer
              </p>
              {productionRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 border-b border-white/10/80 pb-3 md:grid-cols-12"
                >
                  <Input
                    className="border-white/10 bg-black/40 md:col-span-5"
                    value={row.name}
                    onChange={(e) =>
                      updateNamedRow(setProductionRows, idx, {
                        name: e.target.value,
                      })
                    }
                    placeholder="Name *"
                  />
                  <div className="md:col-span-5">
                    {roleSelect(
                      row.role,
                      (v) => updateNamedRow(setProductionRows, idx, { role: v }),
                      PRODUCTION_ROLES,
                      `prod-role-${idx}`
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 md:col-span-2"
                    onClick={() =>
                      setProductionRows((prev) =>
                        prev.length > 1
                          ? prev.filter((_, i) => i !== idx)
                          : prev
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10"
                onClick={() =>
                  setProductionRows((prev) => [...prev, { name: "", role: "" }])
                }
              >
                Add production / engineer
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Performer
              </p>
              {performerRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 border-b border-white/10/80 pb-3 md:grid-cols-12"
                >
                  <Input
                    className="border-white/10 bg-black/40 md:col-span-5"
                    value={row.name}
                    onChange={(e) =>
                      updateNamedRow(setPerformerRows, idx, {
                        name: e.target.value,
                      })
                    }
                    placeholder="Name *"
                  />
                  <div className="md:col-span-5">
                    {roleSelect(
                      row.role,
                      (v) => updateNamedRow(setPerformerRows, idx, { role: v }),
                      PERFORMER_ROLES,
                      `perf-role-${idx}`
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 md:col-span-2"
                    onClick={() =>
                      setPerformerRows((prev) =>
                        prev.length > 1
                          ? prev.filter((_, i) => i !== idx)
                          : prev
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10"
                onClick={() =>
                  setPerformerRows((prev) => [...prev, { name: "", role: "" }])
                }
              >
                Add performer
              </Button>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Add more
              </p>
              {customRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-center"
                >
                  <Input
                    className="border-white/10 bg-black/40 md:col-span-5"
                    value={row.name}
                    onChange={(e) =>
                      updateNamedRow(setCustomRows, idx, {
                        name: e.target.value,
                      })
                    }
                    placeholder="Name"
                  />
                  <Input
                    className="border-white/10 bg-black/40 md:col-span-5"
                    value={row.role}
                    onChange={(e) =>
                      updateNamedRow(setCustomRows, idx, {
                        role: e.target.value,
                      })
                    }
                    placeholder="Role"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 md:col-span-2"
                    onClick={() =>
                      setCustomRows((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10"
                onClick={() =>
                  setCustomRows((prev) => [...prev, { name: "", role: "" }])
                }
              >
                Add more
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving || uploadingAudio || uploadingStems || calcDuration
              }
              className="inline-flex items-center gap-2 bg-white text-black"
            >
              {saving || uploadingAudio ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : null}
              {mode === "create" ? "Add track" : "Save track"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
