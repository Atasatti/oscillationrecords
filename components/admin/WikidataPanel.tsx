"use client";

import React, { useState } from "react";
import { Loader2, Search, ExternalLink, Check, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";

// Tier 1 (find & link) + Tier 2 (reviewed-creation draft) Wikidata panel for the
// artist editor. Linking just sets the form's `wikidataId` field (saved with the
// normal Save button) — this panel never writes to the DB or to Wikidata itself.
// "Prepare draft" produces a QuickStatements batch the admin reviews and submits.

type WikidataMatch = {
  id: string;
  label: string;
  description: string | null;
  url: string;
  via: "musicbrainz" | "isni" | "name";
};

type LookupResult = {
  strong: WikidataMatch[];
  candidates: WikidataMatch[];
  signals: { haveRefs: string[]; missingRefs: string[]; ready: boolean };
  quickStatements: string;
  quickStatementsUrl: string;
};

const VIA_LABEL: Record<WikidataMatch["via"], string> = {
  musicbrainz: "MusicBrainz ID match",
  isni: "ISNI match",
  name: "Name match",
};

export default function WikidataPanel({
  name,
  musicBrainzId,
  isni,
  spotifyId,
  biography,
  country,
  genres,
  ipis,
  instagramLink,
  xLink,
  tiktokLink,
  soundcloudLink,
  facebookLink,
  youtubeLink,
  value,
  onChange,
}: {
  name: string;
  musicBrainzId: string;
  isni: string;
  spotifyId: string;
  biography: string;
  country: string;
  genres: string;
  ipis: string;
  instagramLink: string;
  xLink: string;
  tiktokLink: string;
  soundcloudLink: string;
  facebookLink: string;
  youtubeLink: string;
  value: string; // current form.wikidataId
  onChange: (q: string) => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [showDraft, setShowDraft] = useState(false);

  const runLookup = async () => {
    if (!name.trim()) {
      toast.error("Enter the artist name first");
      return;
    }
    setLoading(true);
    setResult(null);
    setShowDraft(false);
    try {
      const res = await fetch("/api/admin/wikidata/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, musicBrainzId, isni, spotifyId, biography, country, genres, ipis,
          instagramLink, xLink, tiktokLink, soundcloudLink, facebookLink, youtubeLink,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setResult(data as LookupResult);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wikidata lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const link = (q: string) => {
    onChange(q);
    toast.success(`Linked to ${q} — Save to keep it.`);
  };

  const copyDraft = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.quickStatements);
      toast.success("QuickStatements copied");
    } catch {
      toast.error("Couldn't copy — select the text manually");
    }
  };

  const Match = ({ m }: { m: WikidataMatch }) => {
    const linked = value === m.id;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-foreground hover:underline"
            >
              {m.label}{" "}
              <span className="font-mono text-xs text-muted-foreground">({m.id})</span>
            </a>
            <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
              {VIA_LABEL[m.via]}
            </span>
          </div>
          {m.description ? (
            <p className="truncate text-xs text-muted-foreground">{m.description}</p>
          ) : null}
        </div>
        {linked ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Linked
          </span>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => link(m.id)}>
            <Link2 className="mr-1 h-3.5 w-3.5" /> Link
          </Button>
        )}
      </div>
    );
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Link this artist to their Wikidata item so it appears in the page&apos;s{" "}
        <code className="font-mono">sameAs</code> — the strongest signal for Google to
        reconcile the entity. Creation stays a manual, reviewed step.
      </p>

      {/* Current link */}
      {value ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <a
            href={`https://www.wikidata.org/wiki/${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 text-sm text-emerald-300 hover:underline"
          >
            <Check className="h-4 w-4 shrink-0" />
            Linked to <span className="font-mono">{value}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" /> Unlink
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <Button type="button" variant="secondary" size="sm" onClick={runLookup} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-4 w-4" />
          )}
          Find on Wikidata
        </Button>
      </div>

      {result ? (
        <div className="mt-4 flex flex-col gap-4">
          {result.strong.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-foreground">
                Strong matches (by identifier)
              </p>
              {result.strong.map((m) => (
                <Match key={m.id} m={m} />
              ))}
            </div>
          ) : null}

          {result.candidates.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-foreground">
                Name candidates{" "}
                <span className="font-normal text-muted-foreground">
                  — confirm it&apos;s the right person before linking
                </span>
              </p>
              {result.candidates.map((m) => (
                <Match key={m.id} m={m} />
              ))}
            </div>
          ) : null}

          {result.strong.length === 0 && result.candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No existing Wikidata item found.
            </p>
          ) : null}

          {/* Tier 2 — reviewed-creation draft */}
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-medium text-foreground">No item yet? Create one (reviewed)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.signals.haveRefs.length > 0 ? (
                <>
                  Independent references present:{" "}
                  <span className="text-emerald-400">{result.signals.haveRefs.join(", ")}</span>.
                </>
              ) : (
                <span className="text-amber-400">
                  No independent identifiers yet (MusicBrainz/ISNI) — an item now risks being
                  removed as non-notable. Add those first.
                </span>
              )}
              {result.signals.missingRefs.length > 0 && result.signals.haveRefs.length > 0 ? (
                <> Missing: {result.signals.missingRefs.join(", ")}.</>
              ) : null}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowDraft((s) => !s)}
              >
                {showDraft ? "Hide" : "Prepare"} QuickStatements draft
              </Button>
            </div>

            {showDraft ? (
              <div className="mt-2 flex flex-col gap-2">
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[0.7rem] leading-relaxed text-amber-200">
                  <p className="font-medium">What to do in QuickStatements:</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    <li>
                      <strong>Log in</strong> (top-right) with your Wikimedia / Wikipedia
                      account — first time, click <em>Allow</em> to authorize it.
                    </li>
                    <li>
                      Open the pre-filled link below — it drops the commands into a{" "}
                      <strong>New batch</strong>. (Or click <em>New batch</em>, choose{" "}
                      <em>Version 1</em>, and paste the copied text.)
                    </li>
                    <li>
                      <strong>Review every line</strong>, then click <em>Import</em> →{" "}
                      <em>Run</em>.
                    </li>
                  </ol>
                </div>
                <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
                  Before running: the draft sets{" "}
                  <span className="font-mono">instance of → human</span> — change it to{" "}
                  <span className="font-mono">musical group (Q215380)</span> if this is a band.
                  Keep it factual; remove anything you can&apos;t reference.
                </p>
                <pre className="scroll-themed max-h-40 overflow-auto rounded-md border border-border bg-black/30 p-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                  {result.quickStatements}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={copyDraft}>
                    Copy
                  </Button>
                  <a href={result.quickStatementsUrl} target="_blank" rel="noopener noreferrer">
                    <Button type="button" size="sm" variant="secondary">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open in QuickStatements
                    </Button>
                  </a>
                </div>
                <p className="text-[0.7rem] text-muted-foreground">
                  After it&apos;s created, paste the new Q-number above (Find again, or just link it)
                  and Save.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
