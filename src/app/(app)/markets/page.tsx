"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, Radio, Zap } from "lucide-react";
import { ASSETS } from "@/lib/assets";
import { change24h, priceOf, useMarket } from "@/store/market";
import { timeAgo, usd } from "@/lib/format";
import { AssetTable } from "@/components/asset-table";
import { ReleaseClock } from "@/components/release-clock";
import { LiveFeed } from "@/components/chrome";
import { Poster } from "@/components/poster";
import { ContractProofStrip } from "@/components/onchain-epi";
import { Change, SimBadge } from "@/components/ui";
import { CHAIN, CHAIN_LABEL, CHAIN_ON, IS_LIVE } from "@/lib/env";

const TABS = [
  { id: "all", label: "Most traded" },
  { id: "movie", label: "Movies" },
  { id: "show", label: "Shows" },
  { id: "new", label: "Recently listed" },
] as const;

/** Rows shown before "Show all", sized so the table ends near the right column. */
const ROWS = 10;

export default function Discover() {
  const markets = useMarket((s) => s.markets);
  const randomOracle = useMarket((s) => s.randomOracle);
  const router = useRouter();
  const hasActivity = useMarket((s) => s.feed.length > 0);
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
  // Only titles that actually moved that way; a quiet day shows an empty state, not mislabeled rows.
  const gainers = byChange.filter((a) => change24h(markets[a.id]) > 0).slice(0, 4);
  const losers = byChange.filter((a) => change24h(markets[a.id]) < 0).reverse().slice(0, 4);


  // Hero pick: highest-EPI title currently in theaters (falls back to the overall leader).
  const inTheaters = [...ASSETS].filter((a) => a.status === "In theaters").sort((a, b) => markets[b.id].epi - markets[a.id].epi)[0];
  const spot = inTheaters ?? [...ASSETS].sort((a, b) => markets[b.id].epi - markets[a.id].epi)[0];
  // Say why this title is the one on the buttons, so the pick never looks arbitrary.
  const spotReason = inTheaters ? "Highest EPI now in theaters" : "Highest EPI on ENTX";

  return (
    <div className="space-y-6">
      {/* Lead: masthead (what ENTX is), the oracle wire (why prices move), the trade action, then chain proof. */}
      <div className="space-y-4">
        <section className="masthead">
          <div className="min-w-0">
            <h1 className="h-display">
              Entertainment, <span className="text-accent">now tradable.</span>
            </h1>
            <p className="mt-3 max-w-[64ch] text-pretty text-sm leading-relaxed text-muted">
              Movies and shows trade like assets. Prices react to box office, TMDB popularity, audience votes and
              audience ratings, rolled into one live score: the Entertainment Popularity Index (EPI).
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 text-xs leading-relaxed text-muted sm:items-end sm:text-right">
            <Dateline />
            <span>
              Ranked by 24h volume · Prices <span className="font-semibold text-text">simulated</span>
            </span>
          </div>
        </section>

        <OracleWire />

        <section className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {IS_LIVE ? (
              <>
                <SimBadge>Live · testnet</SimBadge>
                Titles and EPI inputs are real TMDB data. Prediction pools are real on-chain state. Asset trading is a
                preview with simulated prices until the shared market launches.
              </>
            ) : (
              <>
                <SimBadge>Hackathon demo</SimBadge>
                Prices and trades are simulated. The {CHAIN_LABEL[CHAIN]} records are real on-chain state.
              </>
            )}
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              {spotReason}: <span className="text-text">{spot.title}</span>, EPI{" "}
              <span className="num text-text">{markets[spot.id].epi.toFixed(1)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/asset/${spot.id}`}
                className="btn-primary cursor-pointer press h-11 px-5 text-[16px]"
              >
                Trade {spot.title} <ArrowRight size={16} />
              </Link>
              {!IS_LIVE && (
                <button
                  onClick={() => {
                    randomOracle(spot.id);
                    router.push(`/asset/${spot.id}`);
                  }}
                  title={`Fires a simulated news event on ${spot.title} and opens its chart, so you can watch EPI and price react`}
                  className="cursor-pointer press inline-flex h-11 items-center gap-2 border border-ink px-4 text-[13px] font-medium hover:bg-panel-2"
                >
                  <Zap size={15} className="text-accent" /> Watch news move {spot.title}
                </button>
              )}
            </div>
          </div>
        </section>

        {CHAIN_ON.near && <ContractProofStrip />}
      </div>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4 self-start">
        <div className="panel min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="h-panel">Markets</h2>
            <SimBadge quiet>Simulated prices</SimBadge>
          </div>
          <div className="seg max-w-full overflow-x-auto [scrollbar-width:none] [&>button]:whitespace-nowrap">
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
          <AssetTable assets={list} limit={showAll ? undefined : ROWS} />
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
        </div>

        <div className="space-y-4">
          <MoverList title="Top gainers" items={gainers} empty="Nothing is up today." />
          <MoverList title="Top losers" items={losers} empty="Nothing is down today." />
          <div className="panel p-4">
            <div className="mb-1 flex items-center gap-2">
              <Radio size={14} className="text-muted" />
              <h2 className="h-panel">Market activity</h2>
              {/* The pulse means "events are arriving"; an empty feed gets no live signal. */}
              {hasActivity && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
                  Live
                </span>
              )}
            </div>
            <LiveFeed
              limit={5}
              empty="No activity yet. Trades, oracle news and on-chain receipts land here as they happen. Trade a title, or open Demo to push a news event."
            />
          </div>
        </div>
      </section>

      {/* Secondary: the calendar explains why prices move, after the markets themselves. */}
      <ReleaseClock />
    </div>
  );
}

function MoverList({ title, items, empty }: { title: string; items: typeof ASSETS; empty: string }) {
  const markets = useMarket((s) => s.markets);
  return (
    <div className="panel p-4">
      <h2 className="h-panel mb-2">{title}</h2>
      {items.length === 0 && <p className="py-2 text-xs text-muted">{empty}</p>}
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/asset/${a.id}`} className="cursor-pointer -mx-2 flex items-center gap-3 px-2 py-1.5 hover:bg-ink/[0.04]">
              <Poster asset={a} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="cond truncate text-[17px] font-bold uppercase leading-tight tracking-[0.02em]">{a.title}</div>
                <div className="text-xs text-muted">{a.ticker}</div>
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

const noSubscribe = () => () => {};

/** Today's date as a dateline; rendered after mount so server and client never disagree. */
function Dateline() {
  const today = useSyncExternalStore(
    noSubscribe,
    () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    () => null,
  );
  return <span className="font-semibold uppercase tracking-[0.06em] text-text">{today ?? "\u00a0"}</span>;
}

/** The oracle wire: the latest news event that moved a price, so the cause sits above the board. */
function OracleWire() {
  const latest = useMarket((s) => s.feed.find((f) => f.type === "oracle"));
  if (!latest) return null;
  const asset = latest.refId ? ASSETS.find((a) => a.id === latest.refId) : undefined;
  return (
    <div role="status" className="wire flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
      <span className="cond text-[14px] font-bold uppercase tracking-[0.08em] text-accent">Oracle wire</span>
      {asset ? (
        <Link href={`/asset/${asset.id}`} className="cursor-pointer min-w-0 hover:underline">
          {latest.text}
        </Link>
      ) : (
        <span className="min-w-0">{latest.text}</span>
      )}
      <span className="ml-auto text-xs text-muted">{timeAgo(latest.ts)} · simulated</span>
    </div>
  );
}
