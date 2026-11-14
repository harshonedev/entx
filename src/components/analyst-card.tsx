"use client";

import clsx from "clsx";
import { Bot } from "lucide-react";
import { analyze } from "@/lib/analyst";
import { useMarket } from "@/store/market";
import { usd } from "@/lib/format";

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
        <Bot size={15} className="text-accent" />
        <span className="h-panel">ENTX Analyst</span>
        <span className="ml-auto text-[10px] text-faint">Recommends only · never trades for you</span>
      </div>
      <div className="mt-3 flex items-end gap-4">
        <div
          className={clsx(
            "rounded-lg px-2.5 py-1 text-sm font-semibold",
            bull ? "bg-up/15 text-up" : bear ? "bg-down/15 text-down" : "bg-white/[0.06] text-text",
          )}
        >
          {sig.rating}
        </div>
        <div className="text-xs text-muted">
          Fair value <span className="num text-text">{usd(sig.fairValue)}</span>{" "}
          <span className={clsx("num", sig.upside >= 0 ? "text-up" : "text-down")}>
            ({sig.upside >= 0 ? "+" : ""}
            {(sig.upside * 100).toFixed(1)}%)
          </span>
        </div>
        <div className="ml-auto text-right text-xs text-muted">
          Confidence <span className="num text-text">{sig.confidence}%</span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{sig.summary}</p>
      <ul className="mt-3 space-y-2">
        {sig.factors.map((f) => (
          <li key={f.name} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-muted">{f.name}</span>
              <div className="relative h-1 flex-1 bg-white/[0.06]">
                <div className="absolute left-1/2 top-0 h-full w-px bg-white/15" />
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
            <div className="mt-0.5 pl-30 text-[11px] text-faint">{f.why}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
