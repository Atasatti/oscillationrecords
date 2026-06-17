"use client";

/**
 * Tiny inline trend line + faint area fill. No axes/labels — for KPI cards.
 */
export default function Sparkline({
  data,
  width = 104,
  height = 30,
  color = "var(--chart-1)",
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (!data || data.length === 0) return null;
  const pad = 2;
  const w = width;
  const h = height;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const n = data.length;
  const x = (i: number) => (n === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1));
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);

  const linePts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPts = `${pad},${h - pad} ${linePts} ${(w - pad).toFixed(1)},${h - pad}`;
  const gid = `spark-${Math.round(x(n - 1))}-${Math.round(max)}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(n - 1)} cy={y(data[n - 1])} r="1.8" fill={color} />
    </svg>
  );
}
