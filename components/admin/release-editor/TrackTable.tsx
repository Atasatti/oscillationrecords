"use client";
import React from "react";
import { Check, Minus, PanelRightOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { EditorTrack } from "@/lib/release-editor";

type ArtistOpt = { id: string; name: string };

/**
 * Spreadsheet view of the whole tracklist — one row per track with the fields you
 * most often audit/enter in bulk (name, ISRC, explicit) inline-editable, and
 * lyrics/audio presence as read-only ticks. The rich per-track editor (lyrics,
 * credits, splits) stays in the Cards view; "open" jumps there.
 */
export default function TrackTable({
  tracks,
  artists,
  requireIsrc,
  onChange,
  onOpen,
}: {
  tracks: EditorTrack[];
  artists: ArtistOpt[];
  requireIsrc: boolean;
  onChange: (rowId: string, patch: Partial<EditorTrack>) => void;
  onOpen: (rowId: string) => void;
}) {
  const artistText = (t: EditorTrack) => {
    const names = t.primaryArtistIds
      .map((id) => artists.find((a) => a.id === id)?.name)
      .filter(Boolean) as string[];
    const feat = t.featureArtistText.trim();
    return (names.join(", ") || "—") + (feat ? ` · feat. ${feat}` : "");
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141414]">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="w-10 px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Name</th>
            <th className="px-3 py-2.5 font-medium">Artists</th>
            <th className="w-44 px-3 py-2.5 font-medium">ISRC {requireIsrc ? "*" : ""}</th>
            <th className="w-24 px-3 py-2.5 font-medium">Explicit</th>
            <th className="w-16 px-3 py-2.5 text-center font-medium">Lyrics</th>
            <th className="w-16 px-3 py-2.5 text-center font-medium">Audio</th>
            <th className="w-12 px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => {
            const isrcMissing = requireIsrc && !t.isrcCode.trim();
            return (
              <tr
                key={t.rowId}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
              >
                <td className="px-3 py-2 tabular-nums text-gray-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <Input
                    value={t.name}
                    onChange={(e) => onChange(t.rowId, { name: e.target.value })}
                    placeholder="Track name *"
                    className="h-8 border-transparent bg-transparent px-1 hover:border-white/10 focus-visible:border-white/20"
                  />
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                  {artistText(t)}
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={t.isrcCode}
                    onChange={(e) => onChange(t.rowId, { isrcCode: e.target.value })}
                    placeholder="ISRC"
                    className={`h-8 px-2 font-mono text-xs ${
                      isrcMissing ? "border-amber-500/60 bg-amber-500/5" : ""
                    }`}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onChange(t.rowId, { isrcExplicit: !t.isrcExplicit })}
                    aria-pressed={t.isrcExplicit}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      t.isrcExplicit
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-white/10 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.isrcExplicit ? "Yes" : "No"}
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  {t.lyrics.trim() ? (
                    <Check className="mx-auto h-4 w-4 text-emerald-400" aria-label="has lyrics" />
                  ) : (
                    <Minus className="mx-auto h-4 w-4 text-gray-600" aria-label="no lyrics" />
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {t.audioFile ? (
                    <Check className="mx-auto h-4 w-4 text-emerald-400" aria-label="has audio" />
                  ) : (
                    <Minus className="mx-auto h-4 w-4 text-gray-600" aria-label="no audio" />
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onOpen(t.rowId)}
                    className="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white"
                    aria-label="Open full editor"
                    title="Open the full per-track editor"
                  >
                    <PanelRightOpen className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
