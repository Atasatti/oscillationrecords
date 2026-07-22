"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Send, Mail } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";

export default function DigestClient({
  html, isEmpty, staffCount, emailConfigured,
}: {
  html: string;
  isEmpty: boolean;
  staffCount: number;
  emailConfigured: boolean;
}) {
  const toast = useToast();
  const { data: session } = useSession();
  const isOwner = !!session?.user?.isAdmin;
  const [busy, setBusy] = useState<null | "test" | "all">(null);

  const send = async (test: boolean) => {
    if (busy) return;
    setBusy(test ? "test" : "all");
    try {
      const res = await fetch("/api/admin/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(test ? { test: true } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      toast.success(test ? "Sent a test to your inbox" : `Sent to ${j.sent}/${j.recipients} staff`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to send");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Daily digest"
        description="A summary of what needs attention — open messages, draft/upcoming releases, new demos and recent wins."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => send(true)} disabled={!emailConfigured || !!busy}>
              {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send test to me
            </Button>
            {isOwner ? (
              <Button onClick={() => send(false)} disabled={!emailConfigured || !!busy} className="bg-white text-black hover:bg-gray-200">
                {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to staff ({staffCount})
              </Button>
            ) : null}
          </div>
        }
      />

      {!emailConfigured ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          Email sending isn&apos;t configured yet. This preview is live — sending unlocks once an email provider is
          added: <span className="font-mono text-xs">SENDGRID_API_KEY</span> or{" "}
          <span className="font-mono text-xs">RESEND_API_KEY</span>, plus{" "}
          <span className="font-mono text-xs">EMAIL_FROM</span>. For a scheduled daily send, point a cron at <span className="font-mono text-xs">POST /api/admin/digest</span> with
          the <span className="font-mono text-xs">CRON_SECRET</span> header.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span>Preview</span>
          {isEmpty ? <span>Nothing needs attention today</span> : null}
        </div>
        <iframe
          title="Digest preview"
          srcDoc={html}
          className="h-[600px] w-full border-0 bg-[#0b0b0c]"
          sandbox=""
        />
      </div>
    </div>
  );
}
