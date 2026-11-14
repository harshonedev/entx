"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ASSETS, ASSET_BY_ID, type AssetSeed } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { change24h, priceOf, useMarket } from "@/store/market";
import { compactUsd, metricText, num, usd } from "@/lib/format";
import { nextCatalyst, releaseInfo } from "@/lib/release";
import { Poster } from "@/components/poster";
import { PriceChart } from "@/components/price-chart";
import { TradePanel } from "@/components/trade-panel";
import { EpiBreakdown } from "@/components/oracle-panel";
import { OrderBook } from "@/components/order-book";
import { PredictionCard } from "@/components/prediction-card";
import { LiveFeed } from "@/components/chrome";
import { AnalystCard } from "@/components/analyst-card";
import { Change, Dim, Flash, SimBadge, signTone } from "@/components/ui";
import { JumpLink, MobileJumpBar } from "@/components/mobile-jump-bar";
import { NEAR_CONTRACT, nearAccountUrl, nearTxUrl, nearView, type NearMarket } from "@/lib/near-config";

export default function AssetPage() {
  const { id } = useParams<{ id: string }>();
  const asset = ASSET_BY_ID[id];
  const m = useMarket((s) => (asset ? s.markets[asset.id] : undefined));
  const held = useMarket((s) => (asset ? s.holdings[asset.id] : undefined));
  const [step, setStep] = useState(15);
  const oracleEpi = useOracleEpi(asset?.id);

  if (!asset || !m) return <NotListed />;

  const price = priceOf(m);
  const related = PREDICTIONS.filter((p) => p.assetId === asset.id);
  const catalyst = nextCatalyst(asset, related);
  const value = held ? held.units * price : 0;
  const pnl = held ? value - held.cost : 0;
  const epiGap = oracleEpi === null ? null : Math.round((m.epi - oracleEpi) * 10) / 10;
  // The headline metric is seeded from TMDB; simulated news events scale it afterwards.
  const metricMoved = Math.abs(m.metricValue - asset.metric.value) > 1e-9;
  const unreleased = releaseInfo(asset).phase === "upcoming";

  return (
    <div className="space-y-4">
      <Link href="/" className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-muted hover:text-text pointer-coarse:min-h-11">
        <ArrowLeft size={13} /> Discover
      </Link>

      {/* Header: the unit price is the hero. EPI sits on one line under it; volume, the headline metric and
          the next catalyst are quieter context under the title. */}
      <section className="panel flex flex-wrap items-start gap-5 p-4 sm:p-5">
        <Poster asset={asset} size="md" />
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-sm bg-panel-2 px-1.5 py-0.5 text-xs font-medium text-text">{asset.ticker}</span>
            <span className="text-xs text-muted">
              {asset.kind === "movie" ? "Movie" : "Show"} · {asset.genre} · {asset.studio} · {asset.status} ·{" "}
              {releaseInfo(asset).label}
            </span>
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.01em] sm:text-3xl">{asset.title}</h1>
          <p className="mt-0.5 text-sm text-muted">{asset.tagline}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <Stat k="24h volume" source="Simulated">
              <span className="num">{compactUsd(m.volume24h)}</span>
            </Stat>
            <Stat
              k={asset.metric.label}
              // Headline is the real TMDB figure (what markets resolve on); simulated news shows as a change.
              source={
                unreleased && m.metricValue === 0
                  ? "Not released yet"
                  : metricMoved
                    ? `TMDB · simulated news ${m.metricValue >= asset.metric.value ? "+" : "−"}${metricText({
                        value: Math.abs(m.metricValue - asset.metric.value),
                        unit: asset.metric.unit,
                      })}`
                    : "TMDB"
              }
            >
              {unreleased && m.metricValue === 0 ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="num">{metricText({ value: asset.metric.value, unit: asset.metric.unit })}</span>
              )}
            </Stat>
            <Stat k="Next catalyst">
              {catalyst.label}{" "}
              <span className="num font-normal text-muted">
                {catalyst.days === 0 ? "today" : catalyst.days === 1 ? "tomorrow" : `in ${catalyst.days} days`}
              </span>
            </Stat>
          </dl>
        </div>
        <div className="w-full sm:w-auto sm:max-w-[22rem]">
          <div className="flex items-center gap-2">
            <span className="label">Unit price</span>
            <SimBadge />
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="num text-[32px] font-medium leading-tight tracking-[-0.02em]">
              <Flash value={price}><Dim text={usd(price)} /></Flash>
            </span>
            <Change value={change24h(m)} className="text-sm" />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
            <span>
              EPI <span className="num font-semibold text-text"><Flash value={m.epi}>{m.epi.toFixed(1)}</Flash></span>{" "}
              (this session, simulated)
            </span>
            {oracleEpi !== null && (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                <a
                  href={m.oracleTx ? nearTxUrl(m.oracleTx) : nearAccountUrl(NEAR_CONTRACT)}
                  target="_blank"
                  rel="noreferrer"
                  className="cursor-pointer inline-flex min-h-6 items-center gap-1 text-near hover:underline pointer-coarse:min-h-11"
                >
                  Oracle EPI · NEAR <span className="num font-semibold">{oracleEpi.toFixed(1)}</span>
                  <ExternalLink size={11} aria-hidden />
                </a>
              </>
            )}
          </p>
          {epiGap !== null && (
            <details className="group mt-1 text-xs">
              <summary className="cursor-pointer inline-flex min-h-6 list-none items-center text-muted underline decoration-line-2 underline-offset-2 hover:text-text pointer-coarse:min-h-11">
                <span className="num">
                  {epiGap === 0 ? "Session matches the oracle" : `Session is ${Math.abs(epiGap).toFixed(1)} ${epiGap > 0 ? "higher" : "lower"}`}
                </span>
                <span className="ml-1">· why?</span>
              </summary>
              <p className="mt-1 leading-snug text-faint text-pretty">
                Session EPI drifts with simulated news in this browser; the oracle value is the last report on NEAR.
              </p>
            </details>
          )}
        </div>
      </section>

      {/* Source order = mobile order: chart, then the trade ticket, then the research.
          On xl the ticket column spans both rows on the right. */}
      <section className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_1fr]">
        <div className="panel p-3 xl:col-start-1 xl:row-start-1">
          <div className="flex items-center justify-between px-1 pb-2">
            <h2 className="h-panel">{asset.ticker} / USD</h2>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" /> Live simulation · news marked on chart
              </span>
              <div className="seg" role="group" aria-label="Candle size">
                {[
                  [15, "15s"],
                  [60, "1m"],
                ].map(([v, l]) => (
                  <button key={v} className="cursor-pointer" aria-pressed={step === v} onClick={() => setStep(v as number)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <PriceChart assetId={asset.id} step={step} />
        </div>

        <aside
          id="trade"
          aria-label={`Trade ${asset.ticker}`}
          className="scroll-mt-20 space-y-4 xl:col-start-2 xl:row-span-2 xl:row-start-1"
        >
          <TradePanel asset={asset} />
          {held && (
            <div className="panel p-4">
              <h2 className="h-panel">Your position</h2>
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
                  <div className={`num font-semibold ${signTone(pnl / held.cost, 0.005)}`}>
                    {pnl >= 0 ? "+" : ""}
                    {usd(pnl)}
                  </div>
                </div>
              </div>
            </div>
          )}
          <OrderBook assetId={asset.id} />
        </aside>

        <section aria-labelledby="signals-h" className="space-y-4 xl:col-start-1 xl:row-start-2">
          <h2 id="signals-h" className="h-panel">Signals behind the price</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <EpiBreakdown asset={asset} />
            <AnalystCard assetId={asset.id} />
          </div>

          {related.length > 0 && (
            <div>
              <h2 className="h-panel mb-2">Prediction markets on {asset.ticker}</h2>
              <div className={related.length > 1 ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
                {related.map((p) => (
                  <PredictionCard key={p.id} p={p} compact />
                ))}
              </div>
            </div>
          )}

          <div className="panel p-4">
            <h2 className="h-panel mb-1">Activity on {asset.ticker}</h2>
            <LiveFeed refId={asset.id} limit={8} />
          </div>
        </section>
      </section>

      {/* Mobile: the ticket is below the chart, so keep a one-tap way back to it. */}
      <MobileJumpBar targetId="trade">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted">{asset.title}</div>
            <div className="num text-sm font-semibold">
              {usd(price)} <Change value={change24h(m)} className="ml-1 text-xs" />
            </div>
          </div>
          <JumpLink targetId="trade">Trade {asset.ticker}</JumpLink>
        </div>
      </MobileJumpBar>
      <div aria-hidden className="h-16 xl:hidden" />
    </div>
  );
}

/** A quiet secondary stat under the title: label, value, and where the number comes from. */
function Stat({ k, source, children }: { k: string; source?: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-faint">{k}</dt>
      <dd className="mt-0.5 font-medium text-text">{children}</dd>
      {source && <dd className="text-faint">{source}</dd>}
    </div>
  );
}

/** The EPI a trusted oracle last published to NEAR for this title (null until read, or if unavailable). */
function useOracleEpi(assetId: string | undefined) {
  const oracleTx = useMarket((s) => (assetId ? s.markets[assetId]?.oracleTx : undefined));
  const [epi, setEpi] = useState<{ id: string; value: number } | null>(null);

  useEffect(() => {
    if (!assetId) return;
    let live = true;
    nearView<NearMarket | null>("get_market", { market_id: assetId })
      .then((r) => live && r && setEpi({ id: assetId, value: r.epi_x10 / 10 }))
      .catch(() => {});
    return () => {
      live = false;
    };
    // Re-read after this browser publishes a new report.
  }, [assetId, oracleTx]);

  return epi && epi.id === assetId ? epi.value : null;
}

/** Unknown id: say so, then offer the busiest markets instead of a dead end. */
function NotListed() {
  const markets = useMarket((s) => s.markets);
  const top: AssetSeed[] = [...ASSETS]
    .filter((a) => markets[a.id])
    .sort((a, b) => markets[b.id].volume24h - markets[a.id].volume24h)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-lg font-semibold">Asset not listed</h1>
      <p className="mt-1 text-sm text-muted text-pretty">
        There is no ENTX market at this address. It may have been mistyped or delisted.
      </p>
      {top.length > 0 && (
        <section aria-labelledby="suggest-h" className="mt-6 text-left">
          <h2 id="suggest-h" className="h-panel mb-2">Most traded right now</h2>
          <ul className="panel divide-y divide-line">
            {top.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/asset/${a.id}`}
                  className="cursor-pointer flex min-h-11 items-center gap-3 px-3 py-2 hover:bg-white/[0.02]"
                >
                  <Poster asset={a} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.title}</span>
                    <span className="text-xs text-muted">{a.ticker}</span>
                  </span>
                  <span className="text-right text-xs text-muted">
                    <span className="num block text-sm text-text">{usd(priceOf(markets[a.id]))}</span>
                    <span className="num">{compactUsd(markets[a.id].volume24h)} vol</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link href="/" className="cursor-pointer mt-5 inline-flex min-h-11 items-center text-sm text-accent hover:underline">
        Browse all markets
      </Link>
    </div>
  );
}
