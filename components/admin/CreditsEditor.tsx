"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { COMMON_CREDIT_ROLES, type CreditEntry } from "@/lib/credits";

/**
 * Reusable editor for flexible credits — rows of { role, people[] }. People are
 * entered comma-separated. Role has an autocomplete of common roles but accepts
 * anything. Used for both release-level and per-track credits.
 */
export default function CreditsEditor({
  value,
  onChange,
  idPrefix = "credits",
}: {
  value: CreditEntry[];
  onChange: (next: CreditEntry[]) => void;
  idPrefix?: string;
}) {
  const listId = `${idPrefix}-roles`;

  const update = (i: number, patch: Partial<CreditEntry>) =>
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => onChange([...value, { role: "", people: [] }]);
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <datalist id={listId}>
        {COMMON_CREDIT_ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {value.length === 0 ? (
        <p className="text-xs text-gray-500">
          No credits yet — add producers, songwriters, composers, etc.
        </p>
      ) : null}

      {value.map((row, i) => (
        <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            list={listId}
            value={row.role}
            onChange={(e) => update(i, { role: e.target.value })}
            placeholder="Role (e.g. Producer)"
            className="bg-black/40 border-white/10 text-white sm:w-52"
          />
          <Input
            value={row.people.join(", ")}
            onChange={(e) =>
              update(i, { people: e.target.value.split(",").map((s) => s.trimStart()) })
            }
            placeholder="People (comma-separated)"
            className="flex-1 bg-black/40 border-white/10 text-white"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(i)}
            aria-label="Remove credit"
            className="shrink-0 text-red-400 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        className="border-white/10"
      >
        <Plus className="mr-1 h-4 w-4" />
        Add credit
      </Button>
    </div>
  );
}
