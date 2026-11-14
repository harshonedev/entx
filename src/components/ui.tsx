"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { pct } from "@/lib/format";

/** Rounds to the shown precision first, so -0.001% reads as a flat 0.00%, not a red loss. */
export const isFlat = (value: number, digits = 2) => Math.abs(value * 100) < 0.5 * 10 ** -digits;

/**
 * Gain/loss colour with a dead band: moves inside `band` (default ±0.25%) read as neutral,
 * so a fee-sized dip right after a trade doesn't paint the account red.
 */
export function signTone(value: number, band = 0.0025) {
  if (Math.abs(value) < band) return "text-muted";
  return value > 0 ? "text-up" : "text-down";
}

export function Change({ value, className }: { value: number; className?: string }) {
  const flat = isFlat(value);
  return (
    <span
      className={clsx("num relative whitespace-nowrap", flat ? "text-muted" : value > 0 ? "text-up" : "text-down", className)}
    >
      {!flat && <span aria-hidden>{value > 0 ? "▲ " : "▼ "}</span>}
      <span className="sr-only">{flat ? "unchanged " : value > 0 ? "up " : "down "}</span>
      {pct(flat ? 0 : value).replace(/^[+-]/, "")}
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

/**
 * Below `sm`, table rows stack into cards: put this on each cell (with a `data-label`) and it becomes a
 * "label · value" line. Pair with `max-sm:hidden` on <thead> and `max-sm:block` on <tr>.
 */
export const STACK_CELL =
  "max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:px-4 max-sm:py-1 max-sm:text-right max-sm:before:shrink-0 max-sm:before:text-xs max-sm:before:text-muted max-sm:before:content-[attr(data-label)] max-sm:[&>*]:min-w-0 max-sm:[&>*]:break-words";

/**
 * Labels a section's numbers as simulated. Keep one per section (page header or panel heading), not per number.
 * `quiet` drops the outline for a secondary section under a page that already carries a SimBadge.
 */
export function SimBadge({ children = "Simulated", quiet = false }: { children?: ReactNode; quiet?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm text-xs font-medium text-muted",
        quiet ? "py-0.5" : "border border-line-2 px-1.5 py-0.5",
      )}
    >
      {quiet && <span aria-hidden className="size-1.5 rounded-full border border-current" />}
      {children}
    </span>
  );
}

/** The counterpart to SimBadge: marks state that lives on a real chain. */
export function RealBadge({ children = "On-chain · NEAR testnet" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-near/40 px-1.5 py-0.5 text-xs font-medium text-near">
      {children}
    </span>
  );
}

export function EpiMeter({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("h-1 w-full overflow-hidden bg-white/[0.06]", className)}>
      <div
        className="h-full origin-left bg-white/70 motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out"
        style={{ transform: `scaleX(${Math.min(100, Math.max(0, value)) / 100})` }}
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

/** Renders a formatted amount with the fractional part dimmed: $43 255<span>.38</span>. */
export function Dim({ text, className }: { text: string; className?: string }) {
  const i = text.lastIndexOf(".");
  if (i < 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, i)}
      <span className="text-faint">{text.slice(i)}</span>
    </span>
  );
}
