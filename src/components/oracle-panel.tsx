"use client";

import { EPI_LABELS, EPI_WEIGHTS, type AssetSeed, type EpiParts } from "@/lib/assets";
import { useMarket } from "@/store/market";
import { EpiMeter } from "./ui";

export function EpiBreakdown({ asset }: { asset: AssetSeed }) {
  const m = useMarket((s) => s.markets[asset.id]);
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="h-panel">Entertainment Popularity Index</h3>
        <span className="text-xs text-muted">Data confidence {asset.confidence}%</span>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span className="num text-4xl font-semibold">{m.epi.toFixed(1)}</span>
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
