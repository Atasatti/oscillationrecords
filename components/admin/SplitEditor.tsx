"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search, X, Check, Loader2 } from "lucide-react";
import { emptySplitRow, rowsTotal, type SplitRow } from "@/lib/release-splits";

type RosterArtist = { id: string; name: string; realName: string | null; email: string | null };

/**
 * Controlled editor for a royalty split — a list of contributing artists and their
 * percentage shares. Add artists from the roster search (prefills name / real name /
 * email) or add a manual row. No money — reference + shares only. Shared by the
 * release Splits panel and the per-track editor.
 */
export default function SplitEditor({
  value,
  onChange,
  disabled,
  linkWriteBack = false,
}: {
  value: SplitRow[];
  onChange: (rows: SplitRow[]) => void;
  disabled?: boolean;
  /**
   * When true (the release Royalty Split panel), a row linked to a roster artist
   * treats that artist's PROFILE as the source of truth for real name / contact
   * email: a detail already on file shows read-only, and a missing one is entered
   * here and written back to the profile on save. Off (default — e.g. per-track
   * credits) keeps plain editable reference fields.
   */
  linkWriteBack?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RosterArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced roster search (only while the dropdown is open).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/artists/search?q=${encodeURIComponent(query.trim())}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          setResults(j.items || []);
        }
      } catch {
        /* ignore */
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const update = (i: number, patch: Partial<SplitRow>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const addManual = () => onChange([...value, emptySplitRow()]);
  const addFromArtist = (a: RosterArtist) => {
    if (a.id && value.some((r) => r.artistId === a.id)) {
      setOpen(false);
      setQuery("");
      return;
    }
    onChange([
      ...value,
      {
        artistId: a.id,
        name: a.name,
        realName: a.realName ?? "",
        email: a.email ?? "",
        percent: "",
        // Whatever the profile already holds shows read-only; a blank one stays
        // editable and is written back to the profile on save.
        profileHasRealName: !!a.realName,
        profileHasEmail: !!a.email,
      },
    ]);
    setOpen(false);
    setQuery("");
  };

  // One contributor-detail field (real name / email). For a linked artist whose
  // profile already has it, it's read-only (the profile owns it); a linked artist
  // missing it gets an editable field whose value is saved back to the profile;
  // manual rows keep a plain optional field.
  const personalField = (i: number, r: SplitRow, field: "realName" | "email") => {
    const label = field === "realName" ? "Real name" : "Email";
    const value = field === "realName" ? r.realName : r.email;
    const onFile = field === "realName" ? r.profileHasRealName : r.profileHasEmail;
    const linked = !!r.artistId;
    if (linkWriteBack && linked && onFile) {
      return (
        <div
          className={`${inputClass} flex items-center justify-between gap-2`}
          title={`${label} is on ${r.name || "the artist"}'s profile`}
        >
          <span className="truncate text-muted-foreground">{value}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground/60">on profile</span>
        </div>
      );
    }
    const savesToProfile = linkWriteBack && linked && !onFile;
    return (
      <input
        value={value}
        onChange={(e) => update(i, { [field]: e.target.value } as Partial<SplitRow>)}
        disabled={disabled}
        type={field === "email" ? "email" : undefined}
        placeholder={
          savesToProfile ? `${label} — saved to ${r.name || "artist"}'s profile` : `${label} (optional)`
        }
        aria-label={label}
        className={inputClass}
      />
    );
  };

  const total = rowsTotal(value);
  const balanceTone =
    total === 100 ? "text-emerald-400" : total > 100 ? "text-red-400" : "text-amber-400";
  const balanceLabel =
    total === 100
      ? "· balanced"
      : total > 100
        ? `· over by ${Math.round((total - 100) * 100) / 100}%`
        : `· ${Math.round((100 - total) * 100) / 100}% unallocated`;

  const inputClass =
    "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

  return (
    <div className="space-y-3">
      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((r, i) => (
            <li key={i} className="rounded-lg border border-border bg-card/50 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  disabled={disabled}
                  placeholder="Artist name *"
                  aria-label="Artist name"
                  className={`min-w-0 flex-1 ${inputClass}`}
                />
                <input
                  value={r.percent}
                  onChange={(e) => update(i, { percent: e.target.value.replace(/[^0-9.]/g, "") })}
                  disabled={disabled}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Split percent"
                  className={`w-16 text-right ${inputClass}`}
                />
                <span className="text-sm text-muted-foreground">%</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={disabled}
                  aria-label={`Remove ${r.name || "artist"}`}
                  className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {personalField(i, r, "realName")}
                {personalField(i, r, "email")}
              </div>
              {r.artistId ? (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-400/80">
                  <Check className="h-3 w-3" />{" "}
                  {linkWriteBack
                    ? "Linked — real name & contact come from this artist's profile"
                    : "Linked to roster artist"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No split yet — add the contributing artists and their shares.
        </p>
      )}

      {/* Add controls: roster search + manual */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div ref={boxRef} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            placeholder="Add from roster — search artists…"
            className={`w-full pl-9 ${inputClass}`}
          />
          {open ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
              {searching ? (
                <p className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </p>
              ) : results.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">No artists match.</p>
              ) : (
                results.map((a) => {
                  const added = value.some((r) => r.artistId === a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => addFromArtist(a)}
                      disabled={added}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {a.name}
                        {a.realName ? (
                          <span className="text-muted-foreground"> · {a.realName}</span>
                        ) : null}
                      </span>
                      {added ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={addManual}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-white/[0.04] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add manually
        </button>
      </div>

      {value.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Total <span className="tabular-nums text-foreground">{total}%</span>{" "}
          <span className={balanceTone}>{balanceLabel}</span>
        </p>
      ) : null}
    </div>
  );
}
