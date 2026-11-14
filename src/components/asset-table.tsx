"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AssetSeed } from "@/lib/assets";
import { change24h, priceOf, useMarket } from "@/store/market";
import { compactUsd, metricText, usd } from "@/lib/format";
import { Poster } from "./poster";
import { Change, EpiMeter, Flash, Sparkline } from "./ui";

export function AssetTable({ assets, showMetric = true }: { assets: AssetSeed[]; showMetric?: boolean }) {
  const markets = useMarket((s) => s.markets);
  const candles = useMarket((s) => s.candles);
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
            <th className="py-2 pl-4 font-medium">Asset</th>
            <th className="py-2 text-right font-medium">Price</th>
            <th className="py-2 text-right font-medium">24h</th>
            <th className="hidden py-2 pl-6 font-medium sm:table-cell">EPI</th>
            <th className="py-2 text-right font-medium">Volume</th>
            {showMetric && <th className="hidden py-2 pl-6 font-medium lg:table-cell">Signal</th>}
            <th className="py-2 pr-4 text-right font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => {
            const m = markets[a.id];
            const price = priceOf(m);
            const closes = (candles[a.id] ?? []).slice(-48).map((c) => c.close);
            return (
              <tr
                key={a.id}
                onClick={() => router.push(`/asset/${a.id}`)}
                className="cursor-pointer border-t border-line transition-colors hover:bg-white/[0.025]"
              >
                <td className="py-2.5 pl-4">
                  <Link href={`/asset/${a.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <Poster asset={a} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.title}</div>
                      <div className="text-xs text-muted">
                        <span className="font-semibold text-text/80">{a.ticker}</span> · {a.kind === "movie" ? "Movie" : "Show"} · {a.status}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="num py-2.5 text-right font-medium">
                  <Flash value={price}>{usd(price)}</Flash>
                </td>
                <td className="py-2.5 text-right text-xs">
                  <Change value={change24h(m)} />
                </td>
                <td className="hidden py-2.5 pl-6 sm:table-cell">
                  <div className="flex w-28 items-center gap-2">
                    <span className="num w-9 text-xs font-medium">{m.epi.toFixed(1)}</span>
                    <EpiMeter value={m.epi} />
                  </div>
                </td>
                <td className="num py-2.5 text-right text-xs text-muted">{compactUsd(m.volume24h)}</td>
                {showMetric && (
                  <td className="hidden py-2.5 pl-6 text-xs text-muted lg:table-cell">
                    <span className="text-faint">{a.metric.label}</span>{" "}
                    <span className="num text-text/80">{metricText({ value: m.metricValue, unit: a.metric.unit })}</span>
                  </td>
                )}
                <td className="py-2.5 pr-4">
                  <Sparkline points={closes} className="ml-auto" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
