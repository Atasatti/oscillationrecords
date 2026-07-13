"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ListMusic, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type Track = { id: string; name: string; audioFile: string | null; isrcCode: string | null; lyrics?: string | null };

/**
 * Step 2 of the release workflow. The full track editor (audio, credits, ISRCs,
 * lyrics, stems) lives on its own page for room to work; this step surfaces the
 * tracklist's readiness at a glance — count + per-track audio/ISRC validation —
 * and links straight into that editor.
 */
export default function ReleaseTracksStep({ releaseId }: { releaseId: string }) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setTracks(Array.isArray(d.tracks) ? d.tracks : []);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [releaseId]);
  useEffect(() => { load(); }, [load]);

  const list = tracks ?? [];
  const withAudio = list.filter((t) => t.audioFile && String(t.audioFile).trim()).length;
  const withIsrc = list.filter((t) => t.isrcCode && String(t.isrcCode).trim()).length;
  const withLyrics = list.filter((t) => t.lyrics && String(t.lyrics).trim()).length;

  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <ListMusic className="h-5 w-5 text-gray-400" /> Tracks
        </h2>
        <Link
          href={`/admin/catalog/releases/${releaseId}/tracks`}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200"
        >
          Manage tracklist <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Add and edit each track — audio, per-track artists, features, credits, ISRCs, lyrics and stems — on the dedicated tracklist editor.
      </p>

      {state === "loading" ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
          No tracks yet — click “Manage tracklist” to add audio, credits, ISRCs, lyrics and stems.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Tracks" value={list.length} ok />
            <Stat label="With audio" value={`${withAudio}/${list.length}`} ok={withAudio === list.length} />
            <Stat label="With ISRC" value={`${withIsrc}/${list.length}`} ok={withIsrc === list.length} />
            <Stat label="With lyrics" value={`${withLyrics}/${list.length}`} ok={withLyrics === list.length} />
          </div>
          <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-xl border border-border bg-card">
            {list.map((t, i) => {
              const audio = !!(t.audioFile && String(t.audioFile).trim());
              const isrc = !!(t.isrcCode && String(t.isrcCode).trim());
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-6 shrink-0 tabular-nums text-gray-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-white">{t.name || "Untitled track"}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${audio ? "text-emerald-400" : "text-red-400"}`}>
                    {audio ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} audio
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${isrc ? "text-emerald-400" : "text-amber-400"}`}>
                    {isrc ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} ISRC
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, ok }: { label: string; value: ReactNode; ok?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-medium tabular-nums ${ok ? "text-white" : "text-amber-400"}`}>{value}</p>
    </div>
  );
}
