"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { Button } from "@/components/ui/button";
import { formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export type AdminBooking = { id: string; start: string; end: string; title: string | null; bookerName: string | null; bookerEmail: string };
export type AdminBooker = { id: string; email: string; name: string | null; note: string | null; createdAt: string };

export default function StudioAdminClient({
  initialBookings, initialBookers,
}: { initialBookings: AdminBooking[]; initialBookers: AdminBooker[] }) {
  const toast = useToast();
  const [bookings, setBookings] = useState(initialBookings);
  const [bookers, setBookers] = useState(initialBookers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const addBooker = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/studio/bookers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't add."); return; }
      setBookers((prev) => [data.booker, ...prev]);
      setEmail(""); setName("");
      toast.success("Added to the studio access list.");
    } finally { setBusy(false); }
  };

  const removeBooker = async (id: string) => {
    if (!confirm("Remove this person's studio access?")) return;
    const res = await fetch(`/api/studio/bookers/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't remove."); return; }
    setBookers((prev) => prev.filter((b) => b.id !== id));
    toast.success("Removed.");
  };

  const cancelBooking = async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/studio/bookings/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't cancel."); return; }
    setBookings((prev) => prev.filter((b) => b.id !== id));
    toast.success("Booking cancelled.");
  };

  const field = "rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Studio access list</h2>
        <form onSubmit={addBooker} className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Google email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={`block ${field}`} />
          </label>
          <label className="text-xs text-muted-foreground">Name (optional)
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`block ${field}`} />
          </label>
          <Button type="submit" disabled={busy}><UserPlus className="mr-1 h-4 w-4" /> Add</Button>
        </form>
        <ul className="space-y-1">
          {bookers.length === 0 ? <li className="text-sm text-muted-foreground">No one added yet.</li> : null}
          {bookers.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span><span className="text-white">{b.email}</span>{b.name ? ` — ${b.name}` : ""}</span>
              <button type="button" onClick={() => removeBooker(b.id)} aria-label={`Remove ${b.email}`} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming bookings</h2>
        <ul className="space-y-1">
          {bookings.length === 0 ? <li className="text-sm text-muted-foreground">No upcoming bookings.</li> : null}
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span>
                {formatStudioDate(new Date(b.start))} · {formatStudioTime(new Date(b.start))}–{formatStudioTime(new Date(b.end))}
                {b.title ? ` — ${b.title}` : ""} <span className="text-muted-foreground">· {b.bookerName ?? b.bookerEmail}</span>
              </span>
              <button type="button" onClick={() => cancelBooking(b.id)} aria-label="Cancel booking" className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
