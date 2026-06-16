"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Trash2, Loader2, ShieldCheck } from "lucide-react";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error();
      // Success: sign out and redirect home (no toast needed — we navigate away).
      await signOut({ callbackUrl: "/" });
    } catch {
      setError("Couldn't delete your account. Please try again or contact us.");
      setDeleting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-16 text-gray-300">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-3xl sm:text-4xl font-light tracking-tighter text-white">
          Your data
        </h1>
      </div>
      <p className="mt-3 leading-relaxed">
        Manage the personal data we hold about you. See our{" "}
        <Link href="/privacy" className="text-white underline">
          Privacy Policy
        </Link>{" "}
        for the full details.
      </p>

      {status === "loading" ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !session?.user ? (
        <div className="mt-10 rounded-xl border border-border bg-card p-6">
          <p className="text-sm">
            Please{" "}
            <Link href="/login" className="text-white underline">
              sign in
            </Link>{" "}
            to download or delete your data.
          </p>
        </div>
      ) : (
        <div className="mt-10 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="mt-1 font-medium text-white">
              {session.user.name || session.user.email}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-medium text-white">Download your data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Get a JSON copy of your account, profile, listening history, and any
              competition entry or newsletter signup.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <a href="/api/account/export">
                <Download className="h-4 w-4" /> Download my data
              </a>
            </Button>
          </div>

          <div className="rounded-xl border border-red-500/30 bg-red-500/[0.03] p-6">
            <h2 className="text-lg font-medium text-white">Delete your account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete your account and all associated data — profile,
              listening history, competition entry, and newsletter signup. This
              cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="mt-4"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete my account
            </Button>
            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and all data we hold about you.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteAccount} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
