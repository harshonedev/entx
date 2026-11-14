"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Clock, Gavel } from "lucide-react";
import { ASSET_BY_ID } from "@/lib/assets";
import { PREDICTIONS, type PredictionSeed } from "@/lib/predictions";
import { yesPrice } from "@/lib/engine";
import { recordedChange, useProbHistory } from "@/lib/prediction-history";
import { MobileJumpBar } from "@/components/mobile-jump-bar";
import { change24h, priceOf, useMarket } from "@/store/market";
import { cents, compactUsd, num, usd } from "@/lib/format";
import { Poster } from "@/components/poster";
import { ProbabilityChart } from "@/components/probability-chart";
import { PICK_SIDE_EVENT, PredictionTicket } from "@/components/prediction-ticket";
import { NearStakePanel } from "@/components/near-stake";
import { CHAIN, IS_LIVE } from "@/lib/env";
import { LiveFeed } from "@/components/chrome";
import { Change, Dim, Flash, SimBadge, Sparkline, signTone } from "@/components/ui";

export default function PredictionMarketPage() {
  const { id } = useParams<{ id: string }>();
  const p = PREDICTIONS.find((x) => x.id === id);
  const st = useMarket((s) => (p ? s.predictions[p.id] : undefined));
  const positions = useMarket((s) => s.positions);
  const history = useProbHistory(id);

  if (!p || !st) {
    return (
      <div className="py-24 text-center">
        <div className="text-lg font-semibold">Market not found</div>
        <p className="mt-1 text-sm text-muted">It may have been renamed or removed from the catalogue.</p>
        <Link href="/predictions" className="cursor-pointer mt-3 inline-block text-sm text-accent">
          Browse prediction markets
        </Link>
      </div>
    );
  }

  const asset = p.assetId ? ASSET_BY_ID[p.assetId] : undefined;
  const yp = yesPrice(st.pool);
  const resolved = st.resolved;
  // Change over recorded points only (up to an hour), never over the modelled lead-in.
  const change = recordedChange(history);
  const delta = change?.pts ?? null;
  const span = !change ? "" : change.seconds >= 3540 ? "past hour" : `past ${Math.max(1, Math.round(change.seconds / 60))} min`;
  const mine = positions.filter((x) => x.marketId === p.id);

  const stakePanel = !resolved && CHAIN === "near" && (
    <div className="panel p-4 [&>*:first-child]:mt-0 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0">
      <NearStakePanel marketId={p.id} />
    </div>
  );

  return (
    <div className="space-y-4">
      <Link
        href="/predictions"
        className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-muted hover:text-text pointer-coarse:min-h-11"
      >
        <ArrowLeft size={13} /> Prediction markets
      </Link>

      {/* Header */}
      <section className="panel flex flex-wrap items-center gap-x-8 gap-y-5 p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-[28rem]">
          <h1 className="cond text-balance text-[28px] font-bold leading-[1.02] sm:text-[38px]">
            {p.question}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-sm bg-panel-2 px-1.5 py-0.5 font-medium text-text">{p.category}</span>
            {asset && (
              <Link href={`/asset/${asset.id}`} className="cursor-pointer font-medium hover:text-text">
                {asset.ticker} · {asset.title}
              </Link>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden />
              {resolved ? "Closed" : p.closesInDays === 1 ? "Closes in 1 day" : `Closes in ${p.closesInDays} days`}
            </span>
            <SimBadge />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="label">{resolved ? "Outcome" : "Chance of YES"}</div>
            <div
              className={clsx(
                "num mt-1 text-[34px] font-medium leading-none tracking-[-0.02em]",
                resolved === "YES" ? "text-up" : resolved === "NO" ? "text-down" : undefined,
              )}
            >
              {resolved ? resolved : <Flash value={yp}>{(yp * 100).toFixed(0)}%</Flash>}
            </div>
            {!resolved && delta !== null && (
              <div className={clsx("num mt-1.5 text-xs", signTone(delta / 100, 0.005))}>
                {Math.abs(delta) < 0.5 ? "Flat" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)} pts`}
                <span className="text-faint"> · {span}{asset ? ` · moves with ${asset.ticker} EPI` : ""}</span>
              </div>
            )}
          </div>
          <div>
            <div className="label">Volume</div>
            <div className="num mt-1 text-lg font-semibold">{compactUsd(st.volume)}</div>
          </div>
        </div>
      </section>

      {/* Source order = mobile order: chart, ticket, then context. On xl the ticket column spans both rows. */}
      <section className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[auto_1fr]">
        <div className="panel p-3 xl:col-start-1 xl:row-start-1">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
            <h2 className="h-panel">Chance of YES</h2>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              {resolved ? (
                <>Settled {resolved} in simulation · trading closed</>
              ) : (
                <>
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" />
                  Live simulation{asset ? ` · ${asset.ticker} news marked by its effect on YES` : ""}
                </>
              )}
            </span>
          </div>
          <ProbabilityChart p={p} />
        </div>

        <aside
          id="bet"
          aria-label="Place a bet"
          className="scroll-mt-20 space-y-4 xl:col-start-2 xl:row-span-2 xl:row-start-1"
        >
          {IS_LIVE && stakePanel}

          {IS_LIVE && <p className="px-1 text-xs text-muted">Preview below: simulated odds and play money, not on-chain.</p>}
          <PredictionTicket p={p} />

          {mine.length > 0 && <YourPosition p={p} yp={yp} resolved={resolved} />}

          {!IS_LIVE && stakePanel}

          <div className="panel p-4">
            <h2 className="h-panel inline-flex items-center gap-1.5">
              <Gavel size={14} aria-hidden className="text-muted" /> How this resolves
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">{p.rules}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              A share costs its price in cents and pays $1.00 if its side wins, so the price is the market&apos;s
              chance.
            </p>
          </div>
        </aside>

        <div className="space-y-4 xl:col-start-1 xl:row-start-2">
          {asset && <LinkedTitle p={p} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              <h2 className="h-panel mb-1">Activity</h2>
              <LiveFeed
                refIds={asset ? [p.id, asset.id] : [p.id]}
                limit={8}
                empty={`No activity yet. Bets on this market${asset ? ` and news on ${asset.ticker}` : ""} show up here.`}
              />
            </div>
            <RelatedMarkets p={p} />
          </div>
        </div>
      </section>

      {/* Mobile: the ticket sits below the chart, so keep a one-tap way back to it. */}
      {!resolved && (
        <>
          <MobileJumpBar targetId="bet">
            {/* Same green/red as the ticket's sides and CTA; each jumps to the ticket with that side picked. */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate text-xs text-muted">{p.question}</div>
              {(["YES", "NO"] as const).map((s) => (
                <a
                  key={s}
                  href="#bet"
                  onClick={() => window.dispatchEvent(new CustomEvent(PICK_SIDE_EVENT, { detail: s }))}
                  aria-label={`Bet ${s === "YES" ? "Yes" : "No"} at ${cents(s === "YES" ? yp : 1 - yp)}`}
                  className={clsx(
                    "cursor-pointer num inline-flex h-11 shrink-0 items-center gap-1.5 rounded px-3.5 text-sm font-semibold text-black",
                    s === "YES" ? "bg-up" : "bg-down",
                  )}
                >
                  {s === "YES" ? "Yes" : "No"}
                  <span className="font-normal opacity-80">{cents(s === "YES" ? yp : 1 - yp)}</span>
                </a>
              ))}
            </div>
          </MobileJumpBar>
          <div aria-hidden className="h-16 xl:hidden" />
        </>
      )}
    </div>
  );
}

function YourPosition({ p, yp, resolved }: { p: PredictionSeed; yp: number; resolved: "YES" | "NO" | null }) {
  const positions = useMarket((s) => s.positions);
  const mine = positions.filter((x) => x.marketId === p.id);
  return (
    <div className="panel p-4">
      <h2 className="h-panel">Your position</h2>
      <ul className="mt-3 space-y-3">
        {mine.map((x) => {
          const px = resolved ? (resolved === x.side ? 1 : 0) : x.side === "YES" ? yp : 1 - yp;
          const value = x.shares * px;
          const pnl = value - x.cost;
          return (
            <li key={x.side} className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div className="col-span-2 flex items-center gap-2">
                <span
                  className={clsx(
                    "rounded-sm px-1.5 py-0.5 text-xs font-semibold",
                    x.side === "YES" ? "bg-up/15 text-up" : "bg-down/15 text-down",
                  )}
                >
                  {x.side}
                </span>
                <span className="num text-xs text-muted">
                  {num(x.shares, 1)} shares · avg {cents(x.cost / x.shares)}
                </span>
              </div>
              <div>
                <div className="text-xs text-faint">{resolved ? "Paid out" : "Value now"}</div>
                <div className="num font-semibold">
                  <Dim text={usd(value)} />
                </div>
              </div>
              <div>
                <div className="text-xs text-faint">{resolved ? "Result" : `Pays if ${x.side}`}</div>
                <div className={clsx("num font-semibold", resolved && signTone(pnl / x.cost, 0.005))}>
                  {resolved ? `${pnl >= 0 ? "+" : ""}${usd(pnl)}` : usd(x.shares)}
                </div>
              </div>
              {!resolved && (
                <div className="col-span-2 flex justify-between text-xs">
                  <span className="text-muted">Gain or loss at today&apos;s odds</span>
                  <span className={clsx("num", signTone(pnl / x.cost, 0.005))}>
                    {pnl >= 0 ? "+" : ""}
                    {usd(pnl)}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LinkedTitle({ p }: { p: PredictionSeed }) {
  const asset = ASSET_BY_ID[p.assetId!];
  const m = useMarket((s) => s.markets[asset.id]);
  if (!m) return null;
  const price = priceOf(m);
  return (
    <section className="panel p-4" aria-labelledby="linked-h">
      <h2 id="linked-h" className="h-panel">
        What moves this market
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link href={`/asset/${asset.id}`} className="cursor-pointer" aria-label={`${asset.title} (${asset.ticker})`}>
          <Poster asset={asset} size="md" />
        </Link>
        <div className="min-w-0 flex-1 basis-56">
          <Link href={`/asset/${asset.id}`} className="cursor-pointer font-semibold hover:text-accent">
            {asset.title}
          </Link>
          <div className="text-xs text-muted">
            {asset.ticker} · {asset.kind === "movie" ? "Movie" : "Show"} · {asset.studio}
          </div>
          <p className="mt-2 max-w-[60ch] text-xs leading-relaxed text-muted">
            Odds follow {asset.title}&apos;s Entertainment Popularity Index.{" "}
            {p.sensitivity > 0
              ? "Good news for the title (a rising EPI) pushes YES up; bad news pushes it down."
              : "Good news for the title (a rising EPI) pushes YES down; bad news pushes it up."}
          </p>
        </div>
        <div className="flex items-end gap-6">
          <div>
            <div className="label">EPI</div>
            <div className="num mt-1 font-semibold">
              <Flash value={m.epi}>{m.epi.toFixed(1)}</Flash>
            </div>
            <Sparkline points={m.epiHistory.slice(-30).map((h) => h.value)} width={72} height={16} />
          </div>
          <div>
            <div className="label">Unit price</div>
            <div className="num mt-1 font-semibold">
              <Dim text={usd(price)} />
            </div>
            <Change value={change24h(m)} className="text-xs" />
          </div>
          <Link
            href={`/asset/${asset.id}#trade`}
            className="cursor-pointer inline-flex h-9 items-center rounded bg-panel-2 px-3 text-xs font-medium hover:bg-ink/[0.07] pointer-coarse:h-11"
          >
            Trade {asset.ticker}
          </Link>
        </div>
      </div>
    </section>
  );
}

function RelatedMarkets({ p }: { p: PredictionSeed }) {
  const predictions = useMarket((s) => s.predictions);
  const sameTitle = PREDICTIONS.filter((x) => x.id !== p.id && p.assetId && x.assetId === p.assetId);
  const sameCat = PREDICTIONS.filter((x) => x.id !== p.id && x.category === p.category && !sameTitle.includes(x));
  const list = [...sameTitle, ...sameCat].slice(0, 5);
  return (
    <div className="panel p-4">
      <h2 className="h-panel mb-1">Related markets</h2>
      {list.length === 0 ? (
        <div className="py-6 text-center text-xs text-faint">No other markets on this title or category yet.</div>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((x) => {
            const s = predictions[x.id];
            const prob = yesPrice(s.pool);
            return (
              <li key={x.id}>
                <Link
                  href={`/predictions/${x.id}`}
                  className="cursor-pointer group flex items-center gap-3 py-2.5 text-xs"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug text-text group-hover:text-accent">{x.question}</span>
                    <span className="mt-0.5 block text-xs text-faint">
                      {x.category} · {compactUsd(s.volume)} vol
                    </span>
                  </span>
                  <span className="num shrink-0 text-right text-sm font-semibold">
                    {s.resolved ? (
                      <span className={s.resolved === "YES" ? "text-up" : "text-down"}>{s.resolved}</span>
                    ) : (
                      `${(prob * 100).toFixed(0)}%`
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
