"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { pct } from "@/lib/format";

export function Change({ value, className }: { value: number; className?: string }) {
  return (
    <span className={clsx("num", value >= 0 ? "text-up" : "text-down", className)}>
      {value >= 0 ? "▲" : "▼"} {pct(value).replace(/^[+-]/, "")}
    </span>
  );
}

/** Briefly flashes green/red when the numeric value changes. */
export function Flash({ value, children, className }: { value: number; children: ReactNode; className?: string }) {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value === prev.current) return;
    const diff = value - prev.current;
    prev.current = value;
    if (Math.abs(diff) / Math.max(Math.abs(value), 1e-9) < 0.0005) return;
    setCls(diff > 0 ? "flash-up" : "flash-down");
    setN((x) => x + 1);
  }, [value]);
  return (
    <span key={n} className={clsx("rounded px-0.5 -mx-0.5", cls, className)}>
      {children}
    </span>
  );
}

export function Sparkline({
  points,
  width = 96,
  height = 28,
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - ((p - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function SimBadge({ children = "Simulated" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
      {children}
    </span>
  );
}

export function EpiMeter({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-white/5", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{
          width: `${Math.min(100, value)}%`,
          background: "linear-gradient(90deg, #f5b544aa, #f5b544)",
        }}
      />
    </div>
  );
}

export function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num mt-1 text-lg font-semibold">{children}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
