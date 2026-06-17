"use client";
import React, { useEffect, useRef, useState } from "react";

type Point = { date: string; count: number };

function fmtDate(d: string) {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Responsive area/line chart (custom SVG, no dependency) with a hover guide +
 * tooltip. Width tracks its container; height is fixed.
 */
export default function TrendArea({
  data,
  height = 220,
  color = "var(--chart-1)",
  valueLabel = "",
}: {
  data: Point[];
  height?: number;
  color?: string;
  valueLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return (
      <div ref={ref} className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data for this period.
      </div>
    );
  }

  const padX = 8;
  const padTop = 16;
  const padBottom = 22;
  const h = height;
  const n = data.length;
  const max = Math.max(...data.map((d) => d.count), 1);
  const x = (i: number) => (n === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (n - 1));
  const y = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);

  const linePts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const areaPts = `${padX},${(h - padBottom).toFixed(1)} ${linePts} ${(w - padX).toFixed(1)},${(h - padBottom).toFixed(1)}`;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let idx = Math.round(((px - padX) / Math.max(1, w - padX * 2)) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    setHover(idx);
  };

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div ref={ref} className="w-full">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="touch-none"
        role="img"
        aria-label={`${valueLabel || "Trend"}: ${total} total over ${n} days`}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline + max gridline */}
        <line x1={padX} y1={h - padBottom} x2={w - padX} y2={h - padBottom} stroke="currentColor" strokeOpacity="0.12" />
        <line x1={padX} y1={padTop} x2={w - padX} y2={padTop} stroke="currentColor" strokeOpacity="0.06" strokeDasharray="3 3" />
        <text x={padX} y={padTop - 5} className="fill-muted-foreground" fontSize="10">
          {max.toLocaleString()}
        </text>

        <polygon points={areaPts} fill="url(#trend-fill)" />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* x labels: first + last */}
        <text x={padX} y={h - 6} className="fill-muted-foreground" fontSize="10">
          {fmtDate(data[0].date)}
        </text>
        <text x={w - padX} y={h - 6} textAnchor="end" className="fill-muted-foreground" fontSize="10">
          {fmtDate(data[n - 1].date)}
        </text>

        {/* hover guide */}
        {hover !== null ? (
          <>
            <line x1={x(hover)} y1={padTop} x2={x(hover)} y2={h - padBottom} stroke={color} strokeOpacity="0.4" />
            <circle cx={x(hover)} cy={y(data[hover].count)} r="3.5" fill={color} stroke="var(--card)" strokeWidth="1.5" />
          </>
        ) : null}
      </svg>

      {hover !== null ? (
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-muted-foreground">{fmtDate(data[hover].date)}</span>
          <span className="font-medium text-foreground">
            {data[hover].count.toLocaleString()} {valueLabel}
          </span>
        </div>
      ) : (
        <div className="mt-1 text-right text-xs text-muted-foreground">
          {total.toLocaleString()} {valueLabel} total
        </div>
      )}
    </div>
  );
}
