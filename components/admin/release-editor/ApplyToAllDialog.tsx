"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";

type ArtistOpt = { id: string; name: string };

export interface ApplyToAllValue {
  primaryArtistIds?: string[];
  featureArtistText?: string;
  isrcExplicit?: boolean;
}

/**
 * Push shared fields onto every track at once (e.g. an album where every track
 * has the same artists / explicit flag). Only the ticked fields are applied.
 */
export default function ApplyToAllDialog({
  open,
  onOpenChange,
  artists,
  trackCount,
  defaultPrimaryArtistIds,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artists: ArtistOpt[];
  trackCount: number;
  defaultPrimaryArtistIds: string[];
  onApply: (value: ApplyToAllValue) => void;
}) {
  const [doArtists, setDoArtists] = useState(true);
  const [doFeature, setDoFeature] = useState(false);
  const [doExplicit, setDoExplicit] = useState(false);

  const [primaryArtistIds, setPrimaryArtistIds] = useState<string[]>(
    defaultPrimaryArtistIds
  );
  const [featureArtistText, setFeatureArtistText] = useState("");
  const [isrcExplicit, setIsrcExplicit] = useState(false);

  const apply = () => {
    const value: ApplyToAllValue = {};
    if (doArtists) value.primaryArtistIds = primaryArtistIds;
    if (doFeature) value.featureArtistText = featureArtistText;
    if (doExplicit) value.isrcExplicit = isrcExplicit;
    onApply(value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#141414] text-white">
        <DialogHeader>
          <DialogTitle>Apply to all tracks</DialogTitle>
          <DialogDescription>
            Set shared fields on all {trackCount} track{trackCount === 1 ? "" : "s"} at
            once. Only ticked fields are changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <input
                type="checkbox"
                checked={doArtists}
                onChange={(e) => setDoArtists(e.target.checked)}
              />
              Primary artists
            </label>
            {doArtists ? (
              <MultiSelect
                options={artists.map((a) => ({ value: a.id, label: a.name }))}
                selected={primaryArtistIds}
                onChange={setPrimaryArtistIds}
                placeholder="Primary artists"
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <input
                type="checkbox"
                checked={doFeature}
                onChange={(e) => setDoFeature(e.target.checked)}
              />
              Featured artists
            </label>
            {doFeature ? (
              <Input
                value={featureArtistText}
                onChange={(e) => setFeatureArtistText(e.target.value)}
                placeholder="e.g. Guest Name, Another Artist (blank clears)"
                className="border-white/10 bg-black/40"
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <input
                type="checkbox"
                checked={doExplicit}
                onChange={(e) => setDoExplicit(e.target.checked)}
              />
              Explicit
            </label>
            {doExplicit ? (
              <div className="flex gap-4 pt-1">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name="apply-explicit"
                    checked={!isrcExplicit}
                    onChange={() => setIsrcExplicit(false)}
                  />
                  No
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name="apply-explicit"
                    checked={isrcExplicit}
                    onChange={() => setIsrcExplicit(true)}
                  />
                  Yes
                </label>
              </div>
            ) : null}
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
            type="button"
            className="bg-white text-black hover:bg-gray-200"
            disabled={!doArtists && !doFeature && !doExplicit}
            onClick={apply}
          >
            Apply to {trackCount} track{trackCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
