"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UpcomingReleasesSortableList from "@/components/admin/UpcomingReleasesSortableList";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";

// A "Coming Soon" item is now just a Release with status=SCHEDULED. This page
// lists those (future-dated) and lets you order how they appear on the home
// "Coming Soon" section. Create/edit happens in the release editor.
type Row = {
  id: string;
  name: string;
  type: "single" | "ep" | "album";
  image: string;
  releaseDate: string;
  primaryArtist?: string | null;
  featureArtist?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function ComingSoonAdmin() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/releases?status=SCHEDULED&pageSize=100");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const mapped: Row[] = (data.items || []).map(
        (r: {
          id: string;
          name: string;
          type: "single" | "ep" | "album";
          thumbnail: string | null;
          releaseDate: string | null;
          primaryArtistName: string | null;
          preSaveUrl: string | null;
          createdAt: string;
        }) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          image: r.thumbnail || "",
          releaseDate: r.releaseDate || "",
          primaryArtist: r.primaryArtistName,
          featureArtist: null,
          createdAt: r.createdAt,
          updatedAt: r.createdAt,
        })
      );
      setRows(mapped);
    } catch {
      toast.error("Failed to load scheduled releases");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReorderSave = async (ordered: Row[]) => {
    try {
      const res = await fetch("/api/admin/releases/coming-soon-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((r) => r.id) }),
      });
      if (!res.ok) throw new Error();
      setRows(ordered);
    } catch (e) {
      toast.error("Failed to save order");
      throw e;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/releases/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete release");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Coming Soon"
        description="Releases scheduled for a future date. Create one in Releases → New release and set its status to “Scheduled”; order them here for the home page."
        actions={
          <Button
            className="bg-white text-black hover:bg-gray-200"
            onClick={() => router.push("/admin/catalog/releases")}
          >
            <Plus className="h-4 w-4" /> New release
          </Button>
        }
      />

      <div className="rounded-xl border border-white/10 bg-[#141414] p-5">
        <h3 className="mb-1 text-lg">Scheduled order</h3>
        <p className="mb-4 text-xs text-gray-500">
          Drag the grip to set the order shown in the home “Coming Soon” section. Saves automatically.
        </p>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-gray-400">
            No scheduled releases. Create a release and set its status to “Scheduled”.
          </p>
        ) : (
          <UpcomingReleasesSortableList
            releases={rows}
            onReorderSave={handleReorderSave}
            onEdit={(r) => router.push(`/admin/catalog/releases/${r.id}/edit`)}
            onDelete={(id) => {
              const r = rows.find((x) => x.id === id);
              setDeleteTarget({ id, name: r?.name ?? "this release" });
            }}
          />
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="bg-[#141414] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Delete release</DialogTitle>
            <DialogDescription className="text-gray-400">
              Delete &quot;{deleteTarget?.name}&quot;? This removes the release and its tracks. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={() => setDeleteTarget(null)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
