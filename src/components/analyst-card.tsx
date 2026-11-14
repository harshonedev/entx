"use client";

import clsx from "clsx";
import { Bot } from "lucide-react";
import { analyze } from "@/lib/analyst";
import { useMarket } from "@/store/market";
import { pct, usd } from "@/lib/format";

export function AnalystCard({ assetId }: { assetId: string }) {
  const m = useMarket((s) => s.markets[assetId]);
  const candles = useMarket((s) => s.candles[assetId]);
  const predictions = useMarket((s) => s.predictions);
  const sig = analyze(assetId, m, candles, predictions);
  const bull = sig.score > 0.15;
  const bear = sig.score < -0.15;

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <Bot size={15} className="text-muted" />
        <h3 className="h-panel">ENTX Analyst</h3>
        <span className="ml-auto text-xs text-muted">Recommends only, never trades for you</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div
          className={clsx(
            "rounded-lg px-2.5 py-1 text-sm font-semibold",
            bull ? "bg-up/[0.08] text-up" : bear ? "bg-down/[0.08] text-down" : "bg-ink/[0.07] text-text",
          )}
        >
          {sig.lean ? `Lean ${sig.rating.toLowerCase()}` : sig.rating}
        </div>
        <div
          className="text-xs text-muted"
          title="The price the EPI alone would justify, ignoring momentum and the prediction crowd"
        >
          Fair value from EPI alone <span className="num text-text">{usd(sig.fairValue)}</span>{" "}
          <span
            className={clsx(
              "num",
              pct(sig.upside, 1) === pct(0, 1) ? "text-muted" : sig.upside > 0 ? "text-up" : "text-down",
            )}
          >
            ({pct(sig.upside, 1)})
          </span>
        </div>
        <div
          className="ml-auto whitespace-nowrap text-right text-xs text-muted"
          title="How strongly the analyst's factors agree on this rating. Not the same as the EPI's data confidence."
        >
          Analyst conviction <span className="num text-text">{sig.confidence}%</span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-pretty">{sig.summary}</p>
      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-text">
          <span className="group-open:hidden">Show the {sig.factors.length} factors behind this rating</span>
          <span className="hidden group-open:inline">Hide factors</span>
        </summary>
        <ul className="mt-3 space-y-3">
          {sig.factors.map((f) => (
            <li key={f.name} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-muted">{f.name}</span>
                <div className="relative h-1 flex-1 bg-ink/[0.07]">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-ink/25" />
                  <div
                    className={clsx("absolute top-0 h-full", f.score >= 0 ? "bg-up" : "bg-down")}
                    style={
                      f.score >= 0
                        ? { left: "50%", width: `${f.score * 50}%` }
                        : { right: "50%", width: `${-f.score * 50}%` }
                    }
                  />
                </div>
                <span className="num w-14 text-right">{f.value}</span>
                <span className="num w-8 text-right text-faint">{Math.round(f.weight * 100)}%</span>
              </div>
              <div className="mt-1 pl-30 text-xs leading-relaxed text-muted">{f.why}</div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
