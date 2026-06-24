"use client";
import React, { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

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
  imagePreview: string | null;
  onPickImage: (file: File) => void;
  onRemoveImage: () => void;
}

export default function ReleaseDetailsPanel({
  value,
  onChange,
  errors,
  artists,
  loadingArtists,
  imagePreview,
  onPickImage,
  onRemoveImage,
}: ReleaseDetailsPanelProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleInput = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value: v } = e.target;
    onChange({ [name]: v } as Partial<ReleaseDetailsValue>);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPickImage(file);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1">
        <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
          <label className="block text-sm font-medium text-gray-300 mb-4">
            Cover image *
          </label>
          <div className="space-y-4">
            {imagePreview ? (
              <div className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Cover"
                  className="w-full aspect-square object-cover rounded-lg border border-white/10"
                />
                <Button
                  type="button"
                  onClick={onRemoveImage}
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
              value={value.name}
              onChange={handleInput}
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
            value={value.description}
            onChange={handleInput}
            placeholder="Description"
            rows={4}
            className="bg-black/40 border-white/10 text-white resize-none"
          />
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
              <option value="DRAFT">Draft (hidden)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {value.status === "SCHEDULED"
                ? "Shows in “Coming Soon” until the release date, then auto-publishes."
                : value.status === "DRAFT"
                  ? "Hidden from the public site while you work on it."
                  : "Live on the site (subject to the release date)."}
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

        <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-medium text-gray-200 mb-4">Genre</h3>
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
        </div>

        <div className="bg-[#141414] rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-medium text-gray-200 mb-1">
            Codes &amp; copyright
          </h3>
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
                value={value[k]}
                onChange={handleInput}
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
        </div>
      </div>
    </div>
  );
}
