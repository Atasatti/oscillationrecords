"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0 hrs 0 min 0 sec";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const remainderAfterDays = totalSeconds % (24 * 3600);
  const hours = Math.floor(remainderAfterDays / 3600);
  const minutes = Math.floor((remainderAfterDays % 3600) / 60);
  const seconds = remainderAfterDays % 60;

  if (days >= 1) {
    return `${days} day${days > 1 ? "s" : ""} ${hours} hrs ${minutes} min ${seconds} sec`;
  }

  return `${hours} hrs ${minutes} min ${seconds} sec`;
}

type AdminRow = {
  id: string;
  name: string;
  email: string;
  releaseName: string;
  musicFileUrl: string | null;
};

export default function BenertRemixAdminPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [competition, setCompetition] = useState<{
    active: boolean;
    endsAt: string | null;
    durationHours: number | null;
  } | null>(null);
  const [durationHours, setDurationHours] = useState(24);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);

  const loadData = async () => {
    try {
      const [entriesRes, compRes] = await Promise.all([
        fetch("/api/benert-remix/admin"),
        fetch("/api/benert-remix/competition"),
      ]);
      if (entriesRes.ok) {
        const data = await entriesRes.json();
        setRows(data);
      } else {
        setError("Failed to load entries");
      }
      if (compRes.ok) {
        const compData = await compRes.json();
        setCompetition({
          active: compData.active,
          endsAt: compData.endsAt,
          durationHours: compData.durationHours,
        });
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!competition?.active || !competition.endsAt) return;
    const endsAt = new Date(competition.endsAt).getTime();
    const update = () => {
      const now = Date.now();
      setCountdownMs(Math.max(0, endsAt - now));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [competition?.active, competition?.endsAt]);

  const handleStartCompetition = async () => {
    if (durationHours < 1) return;
    setStarting(true);
    try {
      const res = await fetch("/api/benert-remix/admin/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationHours }),
      });
      if (res.ok) {
        await loadData();
      } else {
        const err = await res.json();
        setError(err.error || "Failed to start competition");
      }
    } catch {
      setError("Failed to start competition");
    } finally {
      setStarting(false);
    }
  };

  const handleCloseCompetition = async () => {
    setClosing(true);
    try {
      const res = await fetch("/api/benert-remix/admin/close", {
        method: "POST",
      });
      if (res.ok) {
        await loadData();
      } else {
        const err = await res.json();
        setError(err.error || "Failed to close competition");
      }
    } catch {
      setError("Failed to close competition");
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
        <p className="text-white/60">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col items-center justify-center px-4">
        <p className="text-rose-400 mb-4">{error}</p>
        <Button
          variant="outline"
          className="border-white/20 text-white"
          onClick={() => {
            setError(null);
            setLoading(true);
            loadData();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white px-4 py-12 md:px-8 font-[family-name:var(--font-inter)]">
      <h1 className="text-2xl md:text-3xl font-light tracking-tighter text-center mb-4">
        Benert Remix — Admin
      </h1>
      <p className="text-center text-sm text-white/50 max-w-2xl mx-auto mb-10">
        To review the <strong className="text-white/80">public thank-you page</strong> (same as after the competition ends) without
        closing the competition or interrupting uploads/downloads, open it directly:{" "}
        <a
          href="/benert-remix/test"
          target="_blank"
          rel="noopener noreferrer"
          className="text-rose-400 underline decoration-rose-400/50 hover:decoration-rose-400"
        >
          /benert-remix/test
        </a>{" "}
        (new tab)
      </p>

      {/* Start Competition section */}
      <div className="max-w-4xl mx-auto mb-12 p-6 rounded-xl bg-white/5 border border-white/10">
        <h2 className="text-lg font-medium mb-4">Start Competition</h2>
        <p className="text-sm text-white/60 mb-4">
          When you start the competition, the timer and upload section will appear for all users on the benert-remix page.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="duration" className="text-sm text-white/80">
              Duration (hours):
            </label>
            <Input
              id="duration"
              type="number"
              min={1}
              max={168}
              value={durationHours}
              onChange={(e) => setDurationHours(parseInt(e.target.value, 10) || 24)}
              className="w-20 bg-white/10 border-white/20 text-white"
            />
          </div>
          <Button
            className="bg-rose-500 hover:bg-rose-600 text-white"
            onClick={handleStartCompetition}
            disabled={starting || competition?.active}
          >
            {starting ? "Starting..." : competition?.active ? "Competition active" : "Start Competition"}
          </Button>
          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={handleCloseCompetition}
            disabled={closing || !competition?.active}
          >
            {closing ? "Closing..." : "Close Competition"}
          </Button>
        </div>
        {competition?.active && competition.endsAt && (
          <div className="mt-4 space-y-1">
            <p className="text-xs text-white/50 uppercase tracking-wider">Time remaining</p>
            <p className="text-2xl font-mono tabular-nums text-rose-400">
              {countdownMs !== null ? formatCountdown(countdownMs) : "00:00:00"}
            </p>
            <p className="text-sm text-white/50">
              Ends at: {new Date(competition.endsAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Submissions table */}
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-medium mb-4">Submissions</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="text-left p-3 md:p-4 text-sm font-medium">Name</th>
                <th className="text-left p-3 md:p-4 text-sm font-medium">Email</th>
                <th className="text-left p-3 md:p-4 text-sm font-medium">Release name</th>
                <th className="text-left p-3 md:p-4 text-sm font-medium">Music File</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-white/50 text-sm">
                    No submissions yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 last:border-0">
                    <td className="p-3 md:p-4 text-sm">{row.name}</td>
                    <td className="p-3 md:p-4 text-sm">{row.email}</td>
                    <td className="p-3 md:p-4 text-sm">{row.releaseName}</td>
                    <td className="p-3 md:p-4">
                      {row.musicFileUrl ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 h-auto text-rose-400 hover:text-rose-300 hover:underline"
                          asChild
                        >
                          <a
                            href={row.musicFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Download
                          </a>
                        </Button>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
