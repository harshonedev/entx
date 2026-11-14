"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ASSET_BY_ID } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { change24h, priceOf, useMarket } from "@/store/market";
import { compactUsd, metricText, num, usd } from "@/lib/format";
import { Poster } from "@/components/poster";
import { PriceChart } from "@/components/price-chart";
import { TradePanel } from "@/components/trade-panel";
import { EpiBreakdown, OraclePanel } from "@/components/oracle-panel";
import { OrderBook } from "@/components/order-book";
import { PredictionCard } from "@/components/prediction-card";
import { LiveFeed } from "@/components/chrome";
import { AnalystCard } from "@/components/analyst-card";
import { Change, Dim, Flash, SimBadge, Sparkline } from "@/components/ui";

export default function AssetPage() {
  const { id } = useParams<{ id: string }>();
  const asset = ASSET_BY_ID[id];
  const m = useMarket((s) => (asset ? s.markets[asset.id] : undefined));
  const held = useMarket((s) => (asset ? s.holdings[asset.id] : undefined));

  if (!asset || !m) {
    return (
      <div className="py-24 text-center">
        <div className="text-lg font-semibold">Asset not listed</div>
        <Link href="/" className="cursor-pointer mt-2 inline-block text-sm text-accent">
          Back to Discover
        </Link>
      </div>
    );
  }

  const price = priceOf(m);
  const related = PREDICTIONS.filter((p) => p.assetId === asset.id);
  const value = held ? held.units * price : 0;
  const pnl = held ? value - held.cost : 0;

  return (
    <div className="space-y-4">
      <Link href="/" className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-muted hover:text-text">
        <ArrowLeft size={13} /> Discover
      </Link>

      {/* Header */}
      <section className="panel flex flex-wrap items-center gap-5 p-4 sm:p-5">
        <Poster asset={asset} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-sm bg-panel-2 px-1.5 py-0.5 text-xs font-medium text-text">{asset.ticker}</span>
            <span className="text-xs text-muted">
              {asset.kind === "movie" ? "Movie" : "Series"} · {asset.genre} · {asset.studio} · {asset.status}
            </span>
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.01em] sm:text-3xl">{asset.title}</h1>
          <p className="mt-0.5 text-sm italic text-muted">“{asset.tagline}”</p>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="label">Unit price</span>
              <SimBadge />
            </div>
            <div className="num mt-1 text-[30px] font-medium tracking-[-0.02em]">
              <Flash value={price}><Dim text={usd(price)} /></Flash>
            </div>
            <Change value={change24h(m)} className="text-sm" />
          </div>
          <div>
            <div className="label">EPI</div>
            <div className="num mt-1 text-2xl font-semibold">
              <Flash value={m.epi}>{m.epi.toFixed(1)}</Flash>
            </div>
            <Sparkline points={m.epiHistory.slice(-30).map((h) => h.value)} width={80} height={18} />
          </div>
          <div>
            <div className="label">24h volume</div>
            <div className="num mt-1 text-lg font-semibold">{compactUsd(m.volume24h)}</div>
          </div>
          <div>
            <div className="label">{asset.metric.label}</div>
            <div className="num mt-1 text-lg font-semibold">
              {metricText({ value: m.metricValue, unit: asset.metric.unit })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="panel p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="h-panel">{asset.ticker} / USD · 15s candles</span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" /> Live simulation
              </span>
            </div>
            <PriceChart assetId={asset.id} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <OraclePanel asset={asset} />
            <EpiBreakdown asset={asset} />
          </div>

          <AnalystCard assetId={asset.id} />

          {related.length > 0 && (
            <div>
              <div className="h-panel mb-2">Prediction markets on {asset.ticker}</div>
              <div className="grid gap-4 md:grid-cols-2">
                {related.map((p) => (
                  <PredictionCard key={p.id} p={p} compact />
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <TradePanel asset={asset} />
          {held && (
            <div className="panel p-4">
              <div className="h-panel">Your position</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-faint">Units</div>
                  <div className="num font-semibold">{num(held.units, held.units % 1 ? 2 : 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">Avg cost</div>
                  <div className="num font-semibold">{usd(held.cost / held.units)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">Value</div>
                  <div className="num font-semibold">{usd(value)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">Unrealized P&L</div>
                  <div className={`num font-semibold ${pnl >= 0 ? "text-up" : "text-down"}`}>
                    {pnl >= 0 ? "+" : ""}
                    {usd(pnl)}
                  </div>
                </div>
              </div>
            </div>
          )}
          <OrderBook assetId={asset.id} />
          <div className="panel p-4">
            <div className="h-panel mb-1">Activity</div>
            <LiveFeed refId={asset.id} limit={8} />
          </div>
        </aside>
      </section>
    </div>
  );
}
