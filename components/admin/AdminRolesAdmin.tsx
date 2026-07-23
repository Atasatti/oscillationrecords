"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StaffAvatar from "@/components/admin/StaffAvatar";
import { useToast } from "@/components/local-ui/Toast";
import { STAFF_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type StaffRole } from "@/lib/permissions";

type StaffMember = {
  id: string | null;
  email: string;
  name: string | null;
  nickname: string | null;
  image: string | null;
  role: StaffRole;
  locked: boolean;
};

/**
 * Manage who can access the admin area and what they can do. Lists current staff
 * (bootstrap "owner" accounts + role-granted ones), lets you grant a role by
 * email, change a member's role, and revoke access. Backed by /api/admin/users.
 */
export default function AdminRolesAdmin() {
  const toast = useToast();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("catalog");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Per-member nickname edit buffers (keyed by user id), seeded on load.
  const [nickDrafts, setNickDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data.admins);
      setNickDrafts(
        Object.fromEntries(
          (data.admins as StaffMember[])
            .filter((m) => m.id)
            .map((m) => [m.id as string, m.nickname ?? ""])
        )
      );
    } catch {
      toast.error("Failed to load staff");
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
        body: JSON.stringify({ email: e, role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      toast.success(`Added as ${ROLE_LABELS[newRole]}`);
      setEmail("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add staff member");
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (m: StaffMember, role: StaffRole) => {
    if (!m.id || role === m.role) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/users/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      toast.success(`Role changed to ${ROLE_LABELS[role]}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change role");
      load();
    } finally {
      setBusyId(null);
    }
  };

  const saveNickname = async (m: StaffMember) => {
    if (!m.id) return;
    const value = (nickDrafts[m.id] ?? "").trim();
    // No-op if unchanged from what's stored (blur fires even without an edit).
    if (value === (m.nickname ?? "")) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/users/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      toast.success(value ? "Nickname saved" : "Nickname cleared");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save nickname");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: StaffMember) => {
    if (!m.id) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/users/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      toast.success("Access removed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove access");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="flex items-center gap-2 text-lg font-medium text-foreground">
        <Shield className="h-4 w-4 text-muted-foreground" /> Staff &amp; roles
      </h3>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-muted-foreground">
        People who can access this admin area, and what each can do. Adding someone by
        email grants their role — if they haven&apos;t signed in yet, they&apos;ll have
        it the first time they sign in with that Google account. Role changes take full
        effect on the person&apos;s next sign-in.
      </p>

      {/* Add staff member */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="new-member@email.com"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as StaffRole)}
          aria-label="Role for the new member"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <Button onClick={add} disabled={adding || !email.trim()} className="bg-white text-black hover:bg-gray-200">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </Button>
      </div>
      <p className="mb-5 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[newRole]}</p>

      {/* Staff list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {members.map((m) => (
            <li key={m.email} className="flex items-center gap-3 px-4 py-3">
              <StaffAvatar name={m.name} email={m.email} image={m.image} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {m.nickname || m.name || m.email}
                </p>
                {m.nickname || m.name ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {m.nickname && m.name ? `${m.name} · ${m.email}` : m.email}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Display nickname to tell similarly-named accounts apart (e.g. two
                    "Ben"s). Saved on blur / Enter; blank clears it. */}
                {m.id ? (
                  <input
                    value={nickDrafts[m.id] ?? ""}
                    onChange={(e) =>
                      setNickDrafts((d) => ({ ...d, [m.id as string]: e.target.value }))
                    }
                    onBlur={() => saveNickname(m)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    disabled={busyId === m.id}
                    maxLength={40}
                    placeholder="Nickname"
                    aria-label={`Nickname for ${m.name || m.email}`}
                    className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  />
                ) : null}

                {m.locked ? (
                  <Badge variant="default" className="text-[10px]">Owner</Badge>
                ) : m.id ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m, e.target.value as StaffRole)}
                      disabled={busyId === m.id}
                      aria-label={`Role for ${m.name || m.email}`}
                      className="rounded-md border border-border bg-background py-1.5 pl-2.5 pr-7 text-xs text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    >
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(m)}
                      disabled={busyId === m.id}
                      className="shrink-0 text-muted-foreground hover:text-red-400"
                    >
                      {busyId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Remove
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
