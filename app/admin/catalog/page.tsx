"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UpcomingReleasesSortableList from "@/components/admin/UpcomingReleasesSortableList";
import PageHeader from "@/components/admin/shell/PageHeader";
import HomeOrderPanel from "@/components/admin/HomeOrderPanel";
import NewReleaseDialog from "@/components/admin/NewReleaseDialog";
import StudioPhotosAdmin from "@/components/admin/StudioPhotosAdmin";
import PageImagesPanel from "@/components/admin/PageImagesPanel";
import ContactArtworkPanel from "@/components/admin/ContactArtworkPanel";
import { compareComingSoon } from "@/lib/coming-soon-order";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Loader2,
  Disc3,
  Users,
  CalendarClock,
  Image as ImageIcon,
  Mail,
  FileText,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";

// The Homepage hub: one place to curate everything shown on the public home page
// — the New Music carousel, the Featured Artists carousel, and the Coming Soon
// (scheduled releases) strip. Creating/editing releases happens in the editor.
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

type Tab =
  | "new-music"
  | "artists"
  | "coming-soon"
  | "hero"
  | "contact"
  | "about"
  | "backgrounds";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "hero", label: "Home", icon: ImageIcon },
  { key: "contact", label: "Contact", icon: Mail },
  { key: "about", label: "About", icon: FileText },
  { key: "backgrounds", label: "Backgrounds", icon: Layers },
  { key: "new-music", label: "New Music", icon: Disc3 },
  { key: "artists", label: "Featured Artists", icon: Users },
  { key: "coming-soon", label: "Coming Soon", icon: CalendarClock },
];

export default function HomepageAdmin() {
  const router = useRouter();
  const toast = useToast();
  const guard = useUnsavedChangesContext();
  const [tab, setTab] = useState<Tab>("hero");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/releases?status=SCHEDULED&pageSize=100");
      if (!res.ok) throw new Error();
      const data = await res.json();
      type SchedItem = {
        id: string;
        name: string;
        type: "single" | "ep" | "album";
        thumbnail: string | null;
        releaseDate: string | null;
        primaryArtistName: string | null;
        preSaveUrl: string | null;
        createdAt: string;
        comingSoonOrder: number | null;
      };
      // Same comparator as the public Coming Soon strip, so the admin list and
      // the live strip always agree (curated order first, then unordered rows by
      // soonest release date).
      const ordered = ((data.items || []) as SchedItem[]).slice().sort(compareComingSoon);
      const mapped: Row[] = ordered.map(
        (r) => ({
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
    if (tab === "coming-soon") load();
  }, [tab, load]);

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

  // Remove from Coming Soon without deleting the release — move it back to Draft.
  const handleUnschedule = async (id: string) => {
    const prev = rows;
    setRows((list) => list.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/releases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Unscheduled — moved to draft");
    } catch {
      setRows(prev);
      toast.error("Failed to unschedule");
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
        title="Site content"
        description="Everything shown on the public pages — the home page carousels and Coming Soon strip, plus the editable images on the home, contact and about pages."
        actions={
          tab === "coming-soon" ? (
            <Button className="bg-white text-black hover:bg-gray-200" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Schedule a release
            </Button>
          ) : undefined
        }
      />

      <NewReleaseDialog open={newOpen} onOpenChange={setNewOpen} status="scheduled" />

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key !== tab && guard && !guard.confirmNavigation()) return;
              setTab(key);
            }}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-white text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "new-music" ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-lg">New Music carousel</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            The releases featured on the home page, in order. Search to add one, drag
            order with the arrows, or remove with ✕.
          </p>
          <HomeOrderPanel
            kind="release"
            endpoint="/api/admin/releases/home-order"
            emptyTitle="No releases in the New Music carousel yet."
            emptyHint={<>Use the search above to add your first release.</>}
          />
        </div>
      ) : tab === "artists" ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-lg">Featured Artists carousel</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            The artists featured on the home page, in order. Search to add one, order
            with the arrows, or remove with ✕.
          </p>
          <HomeOrderPanel
            kind="artist"
            endpoint="/api/admin/artists/home-order"
            emptyTitle="No featured artists yet."
            emptyHint={<>Use the search above to add your first artist.</>}
          />
        </div>
      ) : tab === "coming-soon" ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-lg">Coming Soon</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Future-dated (Scheduled) releases. Drag the grip to set the order shown
            in the home “Coming Soon” section — saves automatically.
          </p>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">
              No scheduled releases. Use “Schedule a release”, or set a release’s
              status to “Scheduled” in the editor.
            </p>
          ) : (
            <UpcomingReleasesSortableList
              releases={rows}
              onReorderSave={handleReorderSave}
              onEdit={(r) => router.push(`/admin/catalog/releases/${r.id}/edit`)}
              onUnschedule={handleUnschedule}
              onDelete={(id) => {
                const r = rows.find((x) => x.id === id);
                setDeleteTarget({ id, name: r?.name ?? "this release" });
              }}
            />
          )}
        </div>
      ) : tab === "contact" ? (
        <ContactArtworkPanel />
      ) : tab === "about" ? (
        <PageImagesPanel
          group="about"
          title="About page art"
          description="The hero image and decorative floating images on the About page. Upload your own, or reset any back to the built-in artwork."
        />
      ) : tab === "backgrounds" ? (
        <PageImagesPanel
          group="backgrounds"
          title="Section background patterns"
          description="The subtle wave/pattern images sitting behind sections across the site. These are shared, so changing one updates every section that uses it."
        />
      ) : (
        <div className="space-y-8">
          <StudioPhotosAdmin />
          <PageImagesPanel
            group="home"
            title="Home page art"
            description="Other editable images on the home page."
          />
        </div>
      )}

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
