"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  type NameRoleRow,
  type TrackCreditsValue,
  SONGWRITER_ROLES,
  PRODUCTION_ROLES,
  PERFORMER_ROLES,
} from "@/lib/release-editor";

function RoleSelect({
  value,
  onChange,
  options,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  id: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm"
    >
      <option value="">Select role *</option>
      {options.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

export default function TrackCreditsInline({
  value,
  onChange,
  idPrefix,
}: {
  value: TrackCreditsValue;
  onChange: (next: TrackCreditsValue) => void;
  idPrefix: string;
}) {
  const setComposers = (composerNames: string[]) =>
    onChange({ ...value, composerNames });
  const setRows = (
    field: "songwriterRows" | "productionRows" | "performerRows" | "customRows",
    rows: NameRoleRow[]
  ) => onChange({ ...value, [field]: rows });

  const updateRow = (
    field: "songwriterRows" | "productionRows" | "performerRows" | "customRows",
    index: number,
    patch: Partial<NameRoleRow>
  ) =>
    setRows(
      field,
      value[field].map((r, i) => (i === index ? { ...r, ...patch } : r))
    );

  const removeRow = (
    field: "songwriterRows" | "productionRows" | "performerRows",
    index: number
  ) =>
    setRows(
      field,
      value[field].length > 1 ? value[field].filter((_, i) => i !== index) : value[field]
    );

  const namedSection = (
    label: string,
    field: "songwriterRows" | "productionRows" | "performerRows",
    roles: string[],
    addLabel: string,
    keyPrefix: string
  ) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      {value[field].map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 gap-2 border-b border-white/10 pb-3 md:grid-cols-12"
        >
          <Input
            className="border-white/10 bg-black/40 md:col-span-5"
            value={row.name}
            onChange={(e) => updateRow(field, idx, { name: e.target.value })}
            placeholder="Name *"
          />
          <div className="md:col-span-5">
            <RoleSelect
              value={row.role}
              onChange={(v) => updateRow(field, idx, { role: v })}
              options={roles}
              id={`${idPrefix}-${keyPrefix}-role-${idx}`}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            className="text-red-400 hover:text-red-300 md:col-span-2"
            onClick={() => removeRow(field, idx)}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-white/10"
        onClick={() => setRows(field, [...value[field], { name: "", role: "" }])}
      >
        {addLabel}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-medium text-white">
        Track credits <span className="font-normal text-gray-500">(optional)</span>
      </p>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Composer
        </p>
        {value.composerNames.map((cn, idx) => (
          <div key={idx} className="flex gap-2">
            <Input
              value={cn}
              onChange={(e) =>
                setComposers(
                  value.composerNames.map((c, i) => (i === idx ? e.target.value : c))
                )
              }
              placeholder="Name *"
              className="border-white/10 bg-black/40"
            />
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 text-red-400 hover:text-red-300"
              onClick={() =>
                setComposers(
                  value.composerNames.length > 1
                    ? value.composerNames.filter((_, i) => i !== idx)
                    : value.composerNames
                )
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/10"
          onClick={() => setComposers([...value.composerNames, ""])}
        >
          Add composer
        </Button>
      </div>

      {namedSection("Songwriter", "songwriterRows", SONGWRITER_ROLES, "Add songwriter", "sw")}
      {namedSection(
        "Production / Engineer",
        "productionRows",
        PRODUCTION_ROLES,
        "Add production / engineer",
        "prod"
      )}
      {namedSection("Performer", "performerRows", PERFORMER_ROLES, "Add performer", "perf")}

      <div className="space-y-2 border-t border-white/10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Add more
        </p>
        {value.customRows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-center">
            <Input
              className="border-white/10 bg-black/40 md:col-span-5"
              value={row.name}
              onChange={(e) => updateRow("customRows", idx, { name: e.target.value })}
              placeholder="Name"
            />
            <Input
              className="border-white/10 bg-black/40 md:col-span-5"
              value={row.role}
              onChange={(e) => updateRow("customRows", idx, { role: e.target.value })}
              placeholder="Role"
            />
            <Button
              type="button"
              variant="ghost"
              className="text-red-400 hover:text-red-300 md:col-span-2"
              onClick={() =>
                setRows(
                  "customRows",
                  value.customRows.filter((_, i) => i !== idx)
                )
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/10"
          onClick={() => setRows("customRows", [...value.customRows, { name: "", role: "" }])}
        >
          Add more
        </Button>
      </div>
    </div>
  );
}
