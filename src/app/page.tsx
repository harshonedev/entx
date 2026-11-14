"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Radio, Zap } from "lucide-react";
import { ASSETS } from "@/lib/assets";
import { change24h, priceOf, useMarket } from "@/store/market";
import { compactUsd, usd } from "@/lib/format";
import { AssetTable } from "@/components/asset-table";
import { LiveFeed } from "@/components/chrome";
import { Poster } from "@/components/poster";
import { Change, Dim, Flash, SimBadge, Sparkline } from "@/components/ui";

const TABS = [
  { id: "all", label: "Trending" },
  { id: "movie", label: "Movies" },
  { id: "show", label: "Shows" },
  { id: "new", label: "Recently listed" },
] as const;

/** Rows shown before "Show all", sized so the table ends near the right column. */
const ROWS = 6;

export default function Discover() {
  const markets = useMarket((s) => s.markets);
  const candles = useMarket((s) => s.candles);
  const randomOracle = useMarket((s) => s.randomOracle);
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [showAll, setShowAll] = useState(false);

  const byVolume = [...ASSETS].sort((a, b) => markets[b.id].volume24h - markets[a.id].volume24h);
  const list =
    tab === "all"
      ? byVolume
      : tab === "new"
        ? [...ASSETS].filter((a) => a.listedDaysAgo <= 7).sort((a, b) => a.listedDaysAgo - b.listedDaysAgo)
        : byVolume.filter((a) => a.kind === tab);

  const byChange = [...ASSETS].sort((a, b) => change24h(markets[b.id]) - change24h(markets[a.id]));
  const gainers = byChange.slice(0, 4);
  const losers = byChange.slice(-4).reverse();

  const volume = ASSETS.reduce((t, a) => t + markets[a.id].volume24h, 0);
  const avgEpi = ASSETS.reduce((t, a) => t + markets[a.id].epi, 0) / ASSETS.length;

  // Spotlight: highest-EPI title currently in theaters (falls back to the overall leader).
  const spot =
    [...ASSETS].filter((a) => a.status === "In theaters").sort((a, b) => markets[b.id].epi - markets[a.id].epi)[0] ??
    [...ASSETS].sort((a, b) => markets[b.id].epi - markets[a.id].epi)[0];
  const sm = markets[spot.id];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel relative flex flex-col p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <SimBadge>Hackathon demo</SimBadge>
            <span className="text-xs text-muted">Built on NEAR testnet + Solana devnet</span>
          </div>
          <h1 className="mt-5 max-w-xl text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">
            Entertainment, <span className="text-muted">now tradable.</span>
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
            Movies and shows trade like assets. Prices react to box office, streaming demand, social buzz and
            critics — rolled into one live Entertainment Popularity Index.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                const id = randomOracle();
                router.push(`/asset/${id}`);
              }}
              className="cursor-pointer inline-flex h-10 items-center gap-2 rounded bg-accent px-4 text-[13px] font-semibold text-accent-ink hover:brightness-110"
            >
              <Zap size={16} /> Push a live data update
            </button>
            <Link
              href={`/asset/${spot.id}`}
              className="cursor-pointer press inline-flex h-10 items-center gap-2 rounded border border-line-2 px-4 text-[13px] font-medium hover:bg-white/[0.04]"
            >
              Open trading terminal <ArrowRight size={15} />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-5">
            <div>
              <div className="label">24h volume</div>
              <div className="num mt-1 text-xl font-semibold">{compactUsd(volume)}</div>
            </div>
            <div>
              <div className="label">Listed assets</div>
              <div className="num mt-1 text-xl font-semibold">{ASSETS.length}</div>
            </div>
            <div>
              <div className="label">Avg EPI</div>
              <div className="num mt-1 text-xl font-semibold">{avgEpi.toFixed(1)}</div>
            </div>
          </div>
        </div>

        <Link href={`/asset/${spot.id}`} className="cursor-pointer panel group flex flex-col p-5 transition-colors hover:border-line-2">
          <div className="flex items-center justify-between">
            <span className="h-panel">Spotlight</span>
            <span className="text-xs text-muted">{spot.status}</span>
          </div>
          <div className="mt-4 flex gap-4">
            <Poster asset={spot} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-muted">{spot.ticker}</div>
              <div className="mt-0.5 text-lg font-semibold leading-tight">{spot.title}</div>
              <div className="mt-1 text-xs text-muted">{spot.genre} · {spot.studio}</div>
              <div className="num mt-4 text-[32px] font-medium tracking-[-0.02em]">
                <Flash value={priceOf(sm)}><Dim text={usd(priceOf(sm))} /></Flash>
              </div>
              <Change value={change24h(sm)} className="text-sm" />
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="label">EPI</div>
                  <div className="num text-xl font-semibold">{sm.epi.toFixed(1)}</div>
                </div>
                <Sparkline points={(candles[spot.id] ?? []).slice(-60).map((c) => c.close)} width={120} height={36} />
              </div>
            </div>
          </div>
          <div className="mt-auto pt-4 text-xs text-muted group-hover:text-text">
            Trade {spot.ticker} <ArrowRight size={12} className="inline" />
          </div>
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="h-panel">Markets</span>
          <div className="seg">
            {TABS.map((t) => (
              <button
                key={t.id}
                className="cursor-pointer"
                onClick={() => {
                  setTab(t.id);
                  setShowAll(false);
                }}
                aria-pressed={tab === t.id}
              >
                {t.label}
              </button>
            ))}
          </div>
          </div>
          <AssetTable assets={showAll ? list : list.slice(0, ROWS)} />
          {list.length > ROWS && (
            <button
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="cursor-pointer flex h-11 w-full items-center justify-center gap-1.5 border-t border-line text-[12.5px] text-muted hover:bg-panel-2 hover:text-text"
            >
              {showAll ? "Show fewer" : `Show all ${list.length} titles`}
            </button>
          )}
        </div>

        <div className="space-y-4">
          <MoverList title="Top gainers" items={gainers} />
          <MoverList title="Top losers" items={losers} />
          <div className="panel p-4">
            <div className="mb-1 flex items-center gap-2">
              <Radio size={14} className="text-accent" />
              <span className="h-panel">Live market feed</span>
              <span className="live-dot ml-auto h-1.5 w-1.5 rounded-full bg-up" />
            </div>
            <LiveFeed limit={8} />
          </div>
        </div>
      </section>
    </div>
  );
}

function MoverList({ title, items }: { title: string; items: typeof ASSETS }) {
  const markets = useMarket((s) => s.markets);
  return (
    <div className="panel p-4">
      <div className="h-panel mb-2">{title}</div>
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/asset/${a.id}`} className="cursor-pointer -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
              <Poster asset={a} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.ticker}</div>
                <div className="truncate text-xs text-muted">{a.title}</div>
              </div>
              <div className="text-right">
                <div className="num text-sm">{usd(priceOf(markets[a.id]))}</div>
                <Change value={change24h(markets[a.id])} className="text-xs" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
