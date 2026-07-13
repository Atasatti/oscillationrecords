"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollText, Loader2, Upload, Download, ExternalLink, FileText, Trash2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import {
  AGREEMENT_TYPES,
  AGREEMENT_TYPE_LABELS,
  AGREEMENT_DOC_ACCEPT,
  MAX_AGREEMENT_DOC_BYTES,
  MAX_AGREEMENT_DOCS,
  isAllowedAgreementDocType,
  inferAgreementDocType,
  type TermsRecord,
  type AgreementDocument,
} from "@/lib/release-terms";
import { formatBytes } from "@/lib/asset";

/**
 * Licensing / deal terms for a release — type, territory, rights, term dates and
 * notes. Given the label's non-exclusive model, records what each release is
 * licensed under. Sits with the money panels on the release editor. Hides itself
 * if the viewer can't read the release (403).
 */
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function expiryHint(endDate: string): { text: string; cls: string } {
  const days = Math.ceil((new Date(endDate + "T00:00:00Z").getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Expired ${fmtDate(endDate)}`, cls: "text-red-400" };
  if (days === 0) return { text: `Ends today (${fmtDate(endDate)})`, cls: "text-amber-400" };
  if (days <= 30) return { text: `Ends ${fmtDate(endDate)} · in ${days} day${days === 1 ? "" : "s"}`, cls: "text-amber-400" };
  return { text: `Ends ${fmtDate(endDate)}`, cls: "text-gray-500" };
}

export default function ReleaseTermsPanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<string>("");
  const [territory, setTerritory] = useState("");
  const [rights, setRights] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState<AgreementDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fill = (t: TermsRecord) => {
    setType(t.type ?? "");
    setTerritory(t.territory ?? "");
    setRights(t.rights ?? "");
    setStartDate(t.startDate ?? "");
    setEndDate(t.endDate ?? "");
    setNotes(t.notes ?? "");
    setDocuments(t.documents ?? []);
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/terms`);
      if (!r.ok) throw new Error("hidden");
      const j = await r.json();
      fill(j.terms as TermsRecord);
      setState("ok");
    } catch {
      setState("hidden");
    }
  }, [releaseId]);

  useEffect(() => { load(); }, [load]);

  if (state !== "ok") return null;

  // Persist the whole record (fields + the given documents) and re-fill from the
  // server's normalized response. Shared by Save and by upload/remove so document
  // changes stick immediately without needing a separate Save click.
  const patchTerms = async (docs: AgreementDocument[]) => {
    const res = await fetch(`/api/releases/${releaseId}/terms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: type || null, territory, rights, startDate, endDate, notes, documents: docs }),
    });
    if (!res.ok) throw new Error();
    fill((await res.json()).terms as TermsRecord);
  };

  const save = async () => {
    setSaving(true);
    try {
      await patchTerms(documents);
      toast.success("Terms saved");
    } catch {
      toast.error("Couldn't save — you may not have permission.");
    } finally {
      setSaving(false);
    }
  };

  const uploadDocs = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    setUploading(true);
    try {
      const added: AgreementDocument[] = [];
      for (const file of picked) {
        if (documents.length + added.length >= MAX_AGREEMENT_DOCS) {
          toast.error(`You can attach up to ${MAX_AGREEMENT_DOCS} documents.`);
          break;
        }
        const type = inferAgreementDocType(file.name, file.type);
        if (!isAllowedAgreementDocType(type)) {
          toast.error(`"${file.name}" isn't a supported type (PDF, DOC, DOCX, PNG, JPG).`);
          continue;
        }
        if (file.size > MAX_AGREEMENT_DOC_BYTES) {
          toast.error(`"${file.name}" is larger than the 50 MB limit.`);
          continue;
        }
        let pres: Response;
        try {
          pres = await fetch(`/api/releases/${releaseId}/agreement/presign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: file.name, fileType: type }),
          });
        } catch {
          toast.error(`Couldn't reach the server to upload "${file.name}".`);
          continue;
        }
        const pdata = await pres.json().catch(() => ({}));
        if (!pres.ok) {
          toast.error(pdata?.error || `Couldn't prepare the upload for "${file.name}".`);
          continue;
        }
        // Direct-to-S3 PUT; retry once on a transient network error.
        const put = () => fetch(pdata.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": type } });
        let ok = false;
        try {
          ok = (await put().catch(() => put())).ok;
        } catch {
          ok = false;
        }
        if (!ok) {
          toast.error(`Couldn't upload "${file.name}". Please try again.`);
          continue;
        }
        added.push({ name: file.name, url: pdata.fileURL, size: file.size, type, uploadedAt: new Date().toISOString() });
      }
      if (added.length) {
        await patchTerms([...documents, ...added]);
        toast.success(`${added.length} document${added.length === 1 ? "" : "s"} attached`);
      }
    } catch {
      toast.error("Couldn't save the uploaded document(s).");
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (url: string) => {
    try {
      await patchTerms(documents.filter((d) => d.url !== url));
      toast.success("Document removed");
    } catch {
      toast.error("Couldn't remove the document.");
    }
  };

  const inputCls = "rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
  const hint = endDate ? expiryHint(endDate) : null;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <ScrollText className="h-5 w-5 text-gray-400" /> Agreement terms
        </h2>
        {hint ? <span className={`text-sm ${hint.cls}`}>{hint.text}</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Licence type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Licence type" className={`${inputCls} w-full`}>
            <option value="">Not set</option>
            {AGREEMENT_TYPES.map((t) => <option key={t} value={t}>{AGREEMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Territory</label>
          <input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="Worldwide, UK & EU…" className={`${inputCls} w-full`} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Rights granted</label>
          <input value={rights} onChange={(e) => setRights(e.target.value)} placeholder="e.g. Distribution + sync, digital only…" className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Term start</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Term end</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Split summary, contract reference, special conditions…" className={`${inputCls} w-full resize-none`} />
        </div>
      </div>

      {/* Agreement documents — the actual signed contract / PDF / scan. */}
      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-white">Agreement documents</h3>
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/5 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : "Upload document"}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={AGREEMENT_DOC_ACCEPT}
              disabled={uploading}
              className="hidden"
              onChange={(e) => { uploadDocs(e.target.files); e.target.value = ""; }}
            />
          </label>
        </div>

        {documents.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-800 px-3 py-4 text-center text-xs text-gray-500">
            No documents attached yet. Upload the signed agreement, contract or scan.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {documents.map((d) => (
              <li key={d.url} className="flex items-center gap-2 rounded-md border border-gray-800 bg-[#0F0F0F] px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-white" title={d.name}>{d.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-500">{formatBytes(d.size)}</span>
                <a href={d.url} target="_blank" rel="noopener noreferrer" title="Open" aria-label={`Open ${d.name}`}
                  className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a href={`/api/assets/download?url=${encodeURIComponent(d.url)}&name=${encodeURIComponent(d.name)}`} download={d.name} title="Download" aria-label={`Download ${d.name}`}
                  className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button type="button" onClick={() => removeDoc(d.url)} title="Remove" aria-label={`Remove ${d.name}`}
                  className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-950/30 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-xs text-gray-500">PDF, DOC, DOCX, PNG or JPG — up to 50&nbsp;MB each. Uploads save automatically.</p>
      </div>

      <div className="mt-4">
        <button type="button" onClick={save} disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save terms
        </button>
      </div>
    </section>
  );
}
