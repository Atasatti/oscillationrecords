"use client";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import CollapsibleCard from "@/components/admin/CollapsibleCard";
import { RELEASE_DESCRIPTION_MAX } from "@/lib/release-format";

export interface ArtistOption {
  id: string;
  name: string;
}

export type ReleaseStatus = "DRAFT" | "SCHEDULED" | "RELEASED";

/** Release-level fields managed by the editor (everything except the tracklist). */
export interface ReleaseDetailsValue {
  name: string;
  description: string;
  status: ReleaseStatus;
  preSaveUrl: string;
  releaseDate: string;
  primaryGenre: string;
  secondaryGenre: string;
  spotifyLink: string;
  appleMusicLink: string;
  tidalLink: string;
  amazonMusicLink: string;
  youtubeLink: string;
  soundcloudLink: string;
  primaryArtistIds: string[];
  featureArtistText: string;
  isrcExplicit: boolean;
  upcCode: string;
  catalogueNumber: string;
  pLine: string;
  cLine: string;
}

export function emptyReleaseDetails(): ReleaseDetailsValue {
  return {
    name: "",
    description: "",
    status: "DRAFT",
    preSaveUrl: "",
    releaseDate: "",
    primaryGenre: "",
    secondaryGenre: "",
    spotifyLink: "",
    appleMusicLink: "",
    tidalLink: "",
    amazonMusicLink: "",
    youtubeLink: "",
    soundcloudLink: "",
    primaryArtistIds: [],
    featureArtistText: "",
    isrcExplicit: false,
    upcCode: "",
    catalogueNumber: "",
    pLine: "",
    cLine: "",
  };
}

export interface ReleaseDetailsErrors {
  name?: string;
  description?: string;
  coverImage?: string;
  releaseDate?: string;
  primaryArtists?: string;
}

export interface ReleaseDetailsPanelProps {
  value: ReleaseDetailsValue;
  onChange: (patch: Partial<ReleaseDetailsValue>) => void;
  errors: ReleaseDetailsErrors;
  artists: ArtistOption[];
  loadingArtists: boolean;
}

export default function ReleaseDetailsPanel({
  value,
  onChange,
  errors,
  artists,
  loadingArtists,
}: ReleaseDetailsPanelProps) {
  // Collapsed sections keep the page short; Basic is open by default.
  const [open, setOpen] = useState<Record<string, boolean>>({
    basic: true,
    genre: false,
    codes: false,
    streaming: false,
    artists: false,
  });
  const toggle = (k: string) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  // Keep a section with a validation error expanded so the error is never hidden.
  useEffect(() => {
    if (errors.name || errors.description || errors.releaseDate) setOpen((p) => ({ ...p, basic: true }));
    if (errors.primaryArtists) setOpen((p) => ({ ...p, artists: true }));
  }, [errors]);

  const handleInput = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value: v } = e.target;
    onChange({ [name]: v } as Partial<ReleaseDetailsValue>);
  };

  // Live status summaries for the collapsed section headers.
  const linkCount = [
    value.spotifyLink,
    value.appleMusicLink,
    value.tidalLink,
    value.amazonMusicLink,
    value.youtubeLink,
    value.soundcloudLink,
  ].filter((u) => u.trim()).length;
  const codeCount = [value.upcCode, value.catalogueNumber, value.pLine, value.cLine].filter(
    (u) => u.trim()
  ).length;
  const genreCount = [value.primaryGenre, value.secondaryGenre].filter((g) => g.trim()).length;
  // Live description length drives the counter, the over-limit styling and the
  // save-blocking validation in ReleaseEditor. Count the raw value the user sees.
  const descLength = value.description.length;
  const descOverLimit = descLength > RELEASE_DESCRIPTION_MAX;

  const basicSummary = value.name.trim() ? (
    `${value.description.trim().length}-char desc · ${value.status === "SCHEDULED" ? "Scheduled" : "Released"}`
  ) : (
    <span className="text-amber-400">Name required</span>
  );
  const artistsSummary =
    value.primaryArtistIds.length > 0 ? (
      `${value.primaryArtistIds.length} primary`
    ) : (
      <span className="text-amber-400">none selected</span>
    );

  return (
    <div className="space-y-6">
      <CollapsibleCard
        title="Basic"
        summary={basicSummary}
        open={open.basic}
        onToggle={() => toggle("basic")}
      >
        <div className="space-y-4">
          <div>
            <Input
              name="name"
              value={value.name}
              onChange={handleInput}
              placeholder="Release name *"
              aria-invalid={errors.name ? true : undefined}
              className={`bg-black/40 text-white ${
                errors.name ? "border-red-500/70" : "border-white/10"
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-400">{errors.name}</p>
            )}
          </div>
          <div>
            <Textarea
              name="description"
              value={value.description}
              onChange={handleInput}
              placeholder="Description"
              rows={4}
              aria-invalid={descOverLimit ? true : undefined}
              className={`bg-black/40 text-white resize-none ${
                descOverLimit ? "border-red-500/70" : "border-white/10"
              }`}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              {descOverLimit ? (
                <p className="text-sm text-red-400">
                  Description is {descLength - RELEASE_DESCRIPTION_MAX} character
                  {descLength - RELEASE_DESCRIPTION_MAX === 1 ? "" : "s"} over the limit — it
                  will be trimmed to {RELEASE_DESCRIPTION_MAX} when saved.
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Shown on the release page and used as the meta description.
                </p>
              )}
              <span
                className={`shrink-0 text-xs tabular-nums ${
                  descOverLimit ? "text-red-400" : "text-gray-500"
                }`}
              >
                {descLength}/{RELEASE_DESCRIPTION_MAX}
              </span>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Status
            </label>
            <select
              name="status"
              value={value.status}
              onChange={(e) =>
                onChange({ status: e.target.value as ReleaseStatus })
              }
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white"
            >
              <option value="RELEASED">Released (live)</option>
              <option value="SCHEDULED">Scheduled (Coming Soon)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {value.status === "SCHEDULED"
                ? "Shows in “Coming Soon” until the release date, then auto-publishes."
                : "Live on the site (subject to the release date)."}{" "}
              Not ready? Use <span className="text-gray-400">“Save as draft”</span> to keep it
              hidden while you finish it.
            </p>
          </div>
          {value.status === "SCHEDULED" ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                Pre-save link
              </label>
              <Input
                name="preSaveUrl"
                type="url"
                value={value.preSaveUrl}
                onChange={handleInput}
                placeholder="https://ditto.fm/..."
                className="bg-black/40 border-white/10 text-white"
              />
            </div>
          ) : null}
          <div>
            <Input
              name="releaseDate"
              type="date"
              value={value.releaseDate}
              onChange={handleInput}
              aria-invalid={errors.releaseDate ? true : undefined}
              className={`bg-black/40 text-white [color-scheme:dark] ${
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
                  checked={!value.isrcExplicit}
                  onChange={() => onChange({ isrcExplicit: false })}
                  className="border-gray-600"
                />
                No
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                <input
                  type="radio"
                  name="release-explicit"
                  checked={value.isrcExplicit}
                  onChange={() => onChange({ isrcExplicit: true })}
                  className="border-gray-600"
                />
                Yes
              </label>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="Genre"
        summary={genreCount ? `${genreCount}/2 set` : "none"}
        open={open.genre}
        onToggle={() => toggle("genre")}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            name="primaryGenre"
            value={value.primaryGenre}
            onChange={handleInput}
            placeholder="Primary genre"
            className="bg-black/40 border-white/10 text-white"
          />
          <Input
            name="secondaryGenre"
            value={value.secondaryGenre}
            onChange={handleInput}
            placeholder="Secondary genre (optional)"
            className="bg-black/40 border-white/10 text-white"
          />
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="Codes & copyright"
        summary={`${codeCount}/4`}
        open={open.codes}
        onToggle={() => toggle("codes")}
      >
        <p className="mb-4 text-xs text-gray-500">
          Label data from your distributor (Ditto) — stored for your records.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              UPC / barcode
            </label>
            <Input
              name="upcCode"
              value={value.upcCode}
              onChange={handleInput}
              placeholder="e.g. 012345678905"
              className="bg-black/40 border-white/10 text-white font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Catalogue number
            </label>
            <Input
              name="catalogueNumber"
              value={value.catalogueNumber}
              onChange={handleInput}
              placeholder="e.g. OSC001"
              className="bg-black/40 border-white/10 text-white font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              ℗ line (recording)
            </label>
            <Input
              name="pLine"
              value={value.pLine}
              onChange={handleInput}
              placeholder="2024 Oscillation Records"
              className="bg-black/40 border-white/10 text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              © line (composition)
            </label>
            <Input
              name="cLine"
              value={value.cLine}
              onChange={handleInput}
              placeholder="2024 Oscillation Records"
              className="bg-black/40 border-white/10 text-white"
            />
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="Streaming"
        summary={`${linkCount}/6 links`}
        open={open.streaming}
        onToggle={() => toggle("streaming")}
      >
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
              value={value[k]}
              onChange={handleInput}
              placeholder={label}
              className="bg-black/40 border-white/10 text-white"
            />
          ))}
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="Artists"
        summary={artistsSummary}
        open={open.artists}
        onToggle={() => toggle("artists")}
      >
        {loadingArtists ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-4">
            <MultiSelect
              options={artists.map((a) => ({ value: a.id, label: a.name }))}
              selected={value.primaryArtistIds}
              onChange={(ids) => onChange({ primaryArtistIds: ids })}
              placeholder="Primary artists *"
            />
            <p className="text-xs text-gray-500">
              Select one or more — a release can have multiple primary artists.
            </p>
            {errors.primaryArtists ? (
              <p className="text-sm text-red-400">{errors.primaryArtists}</p>
            ) : null}
            <p className="text-xs text-gray-500">Featured (optional)</p>
            <Input
              name="featureArtistText"
              value={value.featureArtistText}
              onChange={handleInput}
              placeholder="e.g. Guest Name, Another Artist"
              className="bg-black/40 border-white/10 text-white"
            />
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
}
