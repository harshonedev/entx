"use client";

import clsx from "clsx";
import { Satellite, TrendingDown, TrendingUp } from "lucide-react";
import { EPI_LABELS, EPI_WEIGHTS, ORACLE_EVENTS, type AssetSeed, type EpiParts } from "@/lib/assets";
import { useMarket } from "@/store/market";
import { EpiMeter } from "./ui";

export function EpiBreakdown({ asset }: { asset: AssetSeed }) {
  const m = useMarket((s) => s.markets[asset.id]);
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="h-panel">Entertainment Popularity Index</span>
        <span className="text-[11px] text-faint">Source confidence {asset.confidence}%</span>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span className="num text-4xl font-semibold text-accent">{m.epi.toFixed(1)}</span>
        <span className="mb-1.5 text-xs text-muted">/ 100</span>
      </div>
      <div className="mt-4 space-y-3">
        {(Object.keys(EPI_WEIGHTS) as (keyof EpiParts)[]).map((k) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted">
                {EPI_LABELS[k]} <span className="text-faint">· {Math.round(EPI_WEIGHTS[k] * 100)}%</span>
              </span>
              <span className="num">{m.epiParts[k].toFixed(0)}</span>
            </div>
            <EpiMeter value={m.epiParts[k]} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OraclePanel({ asset }: { asset: AssetSeed }) {
  const oracle = useMarket((s) => s.oracle);
  const momentum = useMarket((s) => s.markets[asset.id].momentum);
  const reacting = Math.abs(momentum) > 0.002;

  return (
    <div className="panel relative overflow-hidden p-4">
      <div className="flex items-center gap-2">
        <Satellite size={15} className="text-accent" />
        <span className="h-panel">Entertainment oracle</span>
        <span className="ml-auto rounded-sm border border-line-2 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-accent">
          Demo control
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Push a simulated external data update. The EPI recalculates, simulated traders react, and the price
        follows.
      </p>
      <div className="mt-3 grid gap-1.5">
        {ORACLE_EVENTS.map((e) => {
          const positive = Object.values(e.delta).reduce((t, v) => t + (v ?? 0), 0) > 0;
          return (
            <button
              key={e.id}
              onClick={() => oracle(asset.id, e.id)}
              className={clsx(
                "cursor-pointer flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                positive
                  ? "border-up/20 hover:border-up/50 hover:bg-up/[0.06]"
                  : "border-down/20 hover:border-down/50 hover:bg-down/[0.06]",
              )}
            >
              {positive ? (
                <TrendingUp size={14} className="text-up" />
              ) : (
                <TrendingDown size={14} className="text-down" />
              )}
              <span className="flex-1">{e.label}</span>
              <span className="text-[11px] text-faint">
                {Object.entries(e.delta)
                  .map(([k, v]) => `${k === "boxOffice" ? "BO" : k.slice(0, 4)} ${v! > 0 ? "+" : ""}${v}`)
                  .join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
      {reacting && (
        <div className="mt-3 flex items-center gap-2 text-xs text-accent">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
          Market reacting · {momentum > 0 ? "buy" : "sell"} pressure {(Math.abs(momentum) * 100).toFixed(1)}% remaining
        </div>
      )}
    </div>
  );
}
