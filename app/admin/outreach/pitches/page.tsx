"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, MoreVertical, Pencil, Trash2, Loader2, FileText } from "lucide-react";
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

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "not_sent", label: "Not sent" },
  { key: "sent", label: "Sent" },
  { key: "followed_up", label: "Followed up" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  followed_up: "Followed up",
  accepted: "Accepted",
  declined: "Declined",
};

type StatusVariant = "muted" | "default" | "warning" | "success" | "destructive";

function statusVariant(s: string): StatusVariant {
  if (s === "accepted") return "success";
  if (s === "followed_up") return "warning";
  if (s === "sent") return "default";
  if (s === "declined") return "destructive";
  return "muted";
}

type PitchRow = {
  id: string;
  status: string;
  sentAt: string | null;
  followUpDueAt: string | null;
  notes: string | null;
  contact: { id: string; name: string; outlet: string };
  artists: { id: string; name: string }[];
  releases: { id: string; name: string }[];
};

export default function PitchesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [items, setItems] = useState<PitchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activeStatus, setActiveStatus] = useState(searchParams.get("status") || "");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (activeStatus) params.set("status", activeStatus);
      const res = await fetch(`/api/outreach/pitches?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load pitches");
    } finally {
      setLoading(false);
    }
  }, [page, activeStatus, toast]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/outreach/pitches/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Pitch deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete pitch");
    } finally {
      setWorking(false);
    }
  };

  const patchStatus = async (id: string, status: string) => {
    const prev = items;
    setItems((list) => list.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      const res = await fetch(`/api/outreach/pitches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Failed to update status");
    }
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  const isOverdue = (row: PitchRow) =>
    row.followUpDueAt && row.status === "sent" && new Date(row.followUpDueAt) < new Date();

  return (
    <div>
      <PageHeader
        title="Pitches"
        description="Track every pitch sent to a contact, its current status and follow-up schedule."
        actions={
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <Link href="/admin/outreach/pitches/new">
              <Plus className="h-4 w-4" /> New pitch
            </Link>
          </Button>
        }
      />

      {/* Status tabs */}
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setActiveStatus(key); setPage(1); }}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              activeStatus === key
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead className="hidden sm:table-cell">Linked to</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Sent</TableHead>
              <TableHead className="hidden lg:table-cell">Follow-up due</TableHead>
              <TableHead className="w-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  {activeStatus ? `No ${STATUS_LABELS[activeStatus]?.toLowerCase()} pitches.` : "No pitches yet."}
                </TableCell>
              </TableRow>
            ) : items.map((p) => {
              const linked = [...p.artists.map((a) => a.name), ...p.releases.map((r) => r.name)];
              const overdue = isOverdue(p);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/admin/outreach/pitches/${p.id}/edit`} className="group">
                      <p className="font-medium group-hover:underline">{p.contact.name}</p>
                      <p className="text-xs text-muted-foreground">{p.contact.outlet}</p>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {linked.length
                      ? linked.slice(0, 2).join(", ") + (linked.length > 2 ? ` +${linked.length - 2}` : "")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="cursor-pointer">
                          <Badge variant={statusVariant(p.status)}>{STATUS_LABELS[p.status] ?? p.status}</Badge>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {["not_sent", "sent", "followed_up", "accepted", "declined"].map((s) => (
                          <DropdownMenuItem key={s} onClick={() => patchStatus(p.id, s)}>
                            {STATUS_LABELS[s]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {fmtDate(p.sentAt)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    <span className={overdue ? "text-amber-400" : "text-muted-foreground"}>
                      {fmtDate(p.followUpDueAt)}
                      {overdue ? " ⚠" : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/outreach/pitches/${p.id}/edit`)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        {p.status === "accepted" && (
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/catalog/press/new?pitchId=${p.id}&contactName=${encodeURIComponent(p.contact.name)}&outlet=${encodeURIComponent(p.contact.outlet)}`}>
                              <FileText className="mr-2 h-4 w-4" /> Create press item
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                          onClick={() => setDeleteTarget({ id: p.id })}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="border-t border-border px-4 py-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete pitch</DialogTitle>
            <DialogDescription>Delete this pitch record? This cannot be undone.</DialogDescription>
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
