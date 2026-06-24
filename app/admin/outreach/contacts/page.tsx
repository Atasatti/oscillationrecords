"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";

const PAGE_SIZE = 25;

const TYPE_LABELS: Record<string, string> = {
  blog: "Blog",
  curator: "Curator",
  radio: "Radio",
  sync: "Sync",
  influencer: "Influencer",
};

const STATUS_LABELS: Record<string, string> = {
  cold: "Cold",
  contacted: "Contacted",
  responded: "Responded",
  published: "Published",
  declined: "Declined",
};

type ContactRow = {
  id: string;
  name: string;
  outlet: string;
  type: string;
  contactEmail: string | null;
  contactUrl: string | null;
  relationshipStatus: string;
  lastContactedAt: string | null;
  pitchCount: number;
};

type StatusVariant = "muted" | "default" | "warning" | "success" | "destructive";

function statusVariant(s: string): StatusVariant {
  if (s === "published") return "success";
  if (s === "responded") return "warning";
  if (s === "contacted") return "default";
  if (s === "declined") return "destructive";
  return "muted";
}

export default function ContactsPage() {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(queryInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query) params.set("q", query);
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/outreach/contacts?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [page, query, typeFilter, statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/outreach/contacts/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Contact deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete contact");
    } finally {
      setWorking(false);
    }
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

  const TYPES = ["blog", "curator", "radio", "sync", "influencer"];
  const STATUSES = ["cold", "contacted", "responded", "published", "declined"];

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="PR contact database — blogs, curators, radio, sync and influencers."
        actions={
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <Link href="/admin/outreach/contacts/new">
              <Plus className="h-4 w-4" />
              New contact
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search name, outlet or email…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {queryInput ? (
            <button type="button" onClick={() => setQueryInput("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-border bg-card py-2 pl-3 pr-8 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-border bg-card py-2 pl-3 pr-8 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name / Outlet</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Last contacted</TableHead>
              <TableHead className="hidden xl:table-cell">Pitches</TableHead>
              <TableHead className="w-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  {query || typeFilter || statusFilter ? "No contacts match your filters." : "No contacts yet. Add your first PR contact."}
                </TableCell>
              </TableRow>
            ) : items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/admin/outreach/contacts/${c.id}/edit`} className="group">
                    <p className="font-medium group-hover:underline">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.outlet}</p>
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="muted">{TYPE_LABELS[c.type] ?? c.type}</Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {c.contactEmail ? (
                    <a href={`mailto:${c.contactEmail}`} className="hover:text-foreground hover:underline">{c.contactEmail}</a>
                  ) : c.contactUrl ? (
                    <a href={c.contactUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground hover:underline">
                      Submission form <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(c.relationshipStatus)}>
                    {STATUS_LABELS[c.relationshipStatus] ?? c.relationshipStatus}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {fmtDate(c.lastContactedAt)}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                  {c.pitchCount}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${c.name}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/admin/outreach/contacts/${c.id}/edit`)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                        onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t border-border px-4 py-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete contact</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? All pitches linked to this contact will also be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={working}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
