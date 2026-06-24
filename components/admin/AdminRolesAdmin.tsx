"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Plus, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/local-ui/Toast";

type Admin = {
  id: string | null;
  email: string;
  name: string | null;
  image: string | null;
  locked: boolean;
};

/**
 * Manage who can access the admin area. Lists current admins (bootstrap "owner"
 * accounts + role-granted ones), lets you grant admin by email, and revoke
 * role-granted admins. Backed by /api/admin/users.
 */
export default function AdminRolesAdmin() {
  const toast = useToast();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAdmins(data.admins);
    } catch {
      toast.error("Failed to load admins");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const e = email.trim();
    if (!e) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      toast.success("Admin added");
      setEmail("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add admin");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (a: Admin) => {
    if (!a.id) return;
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/admin/users/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      toast.success("Admin access removed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove admin");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="flex items-center gap-2 text-lg font-medium text-foreground">
        <Shield className="h-4 w-4 text-muted-foreground" /> Admins &amp; roles
      </h3>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-muted-foreground">
        People who can access this admin area. Adding someone by email grants admin
        access — if they haven&apos;t signed in yet, they&apos;ll have it the first
        time they sign in with that Google account. Role changes take full effect on
        the person&apos;s next sign-in.
      </p>

      {/* Add admin */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="new-admin@email.com"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button onClick={add} disabled={adding || !email.trim()} className="bg-white text-black hover:bg-gray-200">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add admin
        </Button>
      </div>

      {/* Admins list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {admins.map((a) => (
            <li key={a.email} className="flex items-center gap-3 px-4 py-3">
              {a.image ? (
                <Image src={a.image} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-xs text-muted-foreground">
                  {(a.name || a.email).charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{a.name || a.email}</p>
                {a.name ? <p className="truncate text-xs text-muted-foreground">{a.email}</p> : null}
              </div>
              <Badge variant={a.locked ? "default" : "muted"} className="text-[10px]">
                {a.locked ? "Owner" : "Admin"}
              </Badge>
              {!a.locked && a.id ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(a)}
                  disabled={busyId === a.id}
                  className="shrink-0 text-muted-foreground hover:text-red-400"
                >
                  {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
