"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight, ExternalLink, Loader2, RotateCcw, Trophy } from "lucide-react";
import { ASSETS, ASSET_BY_ID } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { yesPrice } from "@/lib/engine";
import { STARTING_CASH, portfolioValue, priceOf, useMarket, type Trade } from "@/store/market";
import { cents, explorerTx, num, pct, shortKey, timeAgo, usd } from "@/lib/format";
import { useNotarize } from "@/lib/solana";
import { useNear, useNearNotarize } from "@/lib/near";
import { nearTxUrl } from "@/lib/near-config";
import { Poster } from "@/components/poster";
import { clearProbHistory } from "@/lib/prediction-history";
import { STACK_CELL as CELL, SimBadge, signTone } from "@/components/ui";

const BOTS = [
  { name: "reeltrader.sol", ret: 0.412 },
  { name: "boxofficebull", ret: 0.287 },
  { name: "criticsdarling", ret: 0.193 },
  { name: "popcorn_quant", ret: 0.121 },
  { name: "streamwatcher", ret: 0.064 },
  { name: "sequel_skeptic", ret: -0.038 },
  { name: "flopfinder", ret: -0.112 },
];

export default function PortfolioPage() {
  const s = useMarket();
  const v = portfolioValue(s);
  const { publicKey, connected } = useWallet();
  const notarize = useNotarize();
  const nearNotarize = useNearNotarize();
  const { accountId: nearAccount } = useNear();
  const ret = v.total / STARTING_CASH - 1;
  const [confirmReset, setConfirmReset] = useState(false);

  const isEmpty =
    Object.keys(s.holdings).length === 0 && s.positions.length === 0 && s.settled.length === 0 && s.trades.length === 0;
  // Suggest the title with the highest EPI as a first trade.
  const starter = ASSETS.reduce((best, a) => (s.markets[a.id].epi > s.markets[best.id].epi ? a : best), ASSETS[0]);

  const sellAll = (id: string) => {
    const h = s.holdings[id];
    const a = ASSET_BY_ID[id];
    if (!h || !a) return;
    const t = s.sell(id, h.units);
    if (!t) return;
    const pnl = t.total - h.cost;
    s.toast({
      title: `Sold all ${num(t.qty, t.qty % 1 ? 2 : 0)} ${a.ticker}`,
      body: `Received ${usd(t.total)} at avg ${usd(t.price)} · realized ${pnl >= 0 ? "+" : "-"}${usd(Math.abs(pnl))}. Simulated fill.`,
      tone: pnl >= 0 ? "up" : "down",
      href: `/asset/${id}`,
    });
  };

  const leaderboard = [...BOTS, { name: nearAccount ?? (publicKey ? shortKey(publicKey.toBase58()) : "demo-trader"), ret, you: true }].sort(
    (a, b) => b.ret - a.ret,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Portfolio</h1>
            <SimBadge>Simulated balance</SimBadge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {[
              connected && publicKey ? `Solana ${shortKey(publicKey.toBase58())} (devnet)` : null,
              nearAccount ? `NEAR ${nearAccount} (testnet)` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Connect a Solana and/or NEAR wallet to anchor trade receipts on-chain."}
          </p>
        </div>
        {confirmReset ? (
          <div className="flex items-center gap-2 text-xs" role="group" aria-label="Confirm reset">
            <span className="text-muted">Clears trades, bets and odds history.</span>
            <button
              onClick={() => {
                s.reset();
                clearProbHistory();
                setConfirmReset(false);
              }}
              className="cursor-pointer inline-flex min-h-11 items-center rounded-lg bg-down px-3 font-semibold text-black sm:min-h-8"
            >
              Confirm reset
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="cursor-pointer inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-muted hover:text-text sm:min-h-8"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="cursor-pointer inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-text sm:min-h-0"
          >
            <RotateCcw size={13} /> Reset demo
          </button>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Total value" value={usd(v.total)} sub={<span className={signTone(ret)}>{pct(ret)} all-time</span>} big />
        <Card label="Available cash" value={usd(s.cash)} />
        <Card label="Holdings" value={usd(v.holdings)} />
        <Card label="Predictions" value={usd(v.preds)} />
        <Card
          label="P&L (unrealized · realized)"
          value={
            <span>
              <span className={signTone(v.unrealized / Math.max(v.total, 1))}>{usd(v.unrealized)}</span>
              <span className="text-faint"> · </span>
              <span className={signTone(s.realized / Math.max(v.total, 1))}>{usd(s.realized)}</span>
            </span>
          }
        />
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {isEmpty ? (
            <div className="panel px-4 py-6 sm:px-6 sm:py-8">
              <h2 className="h-panel">Nothing traded yet</h2>
              <p className="mt-1.5 max-w-[60ch] text-pretty text-sm leading-relaxed text-muted">
                You start with {usd(STARTING_CASH)} of simulated cash. Buy units of a title, or take a YES/NO position
                on a prediction market. Holdings, open bets and each trade&apos;s on-chain receipts collect here.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/asset/${starter.id}`}
                  className="cursor-pointer press inline-flex h-11 items-center gap-2 rounded bg-accent px-4 text-[13px] font-semibold text-accent-ink hover:brightness-110"
                >
                  Trade {starter.title} <ArrowRight size={15} />
                </Link>
                <Link
                  href="/predictions"
                  className="cursor-pointer press inline-flex h-11 items-center gap-2 rounded border border-line-2 px-4 text-[13px] font-medium hover:bg-white/[0.04]"
                >
                  Browse predictions
                </Link>
                <Link
                  href="/"
                  className="cursor-pointer inline-flex h-11 items-center px-2 text-[13px] text-muted hover:text-text"
                >
                  All markets
                </Link>
              </div>
            </div>
          ) : (
          <>
          <div className="panel overflow-x-auto">
            <h2 className="h-panel px-4 pt-4">Holdings</h2>
            {Object.keys(s.holdings).length === 0 ? (
              <Empty>
                No holdings yet. <Link href="/" className="cursor-pointer text-accent">Discover titles to trade →</Link>
              </Empty>
            ) : (
              <table className="mt-2 w-full text-sm max-sm:block max-sm:[&>tbody]:block sm:min-w-[560px]">
                <thead className="max-sm:hidden">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 pl-4 font-medium">Asset</th>
                    <th className="py-2 text-right font-medium">Units</th>
                    <th className="py-2 text-right font-medium">Avg cost</th>
                    <th className="py-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Value</th>
                    <th className="py-2 text-right font-medium">P&L</th>
                    <th className="py-2 pr-4 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(s.holdings).map(([id, h]) => {
                    const a = ASSET_BY_ID[id];
                    const p = priceOf(s.markets[id]);
                    const val = h.units * p;
                    const pnl = val - h.cost;
                    return (
                      <tr key={id} className="border-t border-line max-sm:block max-sm:py-2">
                        <td className="py-2.5 pl-4 max-sm:block max-sm:px-4">
                          <Link href={`/asset/${id}`} className="cursor-pointer flex items-center gap-3 hover:text-accent">
                            <Poster asset={a} size="sm" />
                            <div>
                              <div className="font-medium">{a.title}</div>
                              <div className="text-xs text-muted">{a.ticker}</div>
                            </div>
                          </Link>
                        </td>
                        <td data-label="Units" className={clsx("num py-2.5 text-right", CELL)}>{num(h.units, h.units % 1 ? 2 : 0)}</td>
                        <td data-label="Avg cost" className={clsx("num py-2.5 text-right text-muted", CELL)}>{usd(h.cost / h.units)}</td>
                        <td data-label="Price" className={clsx("num py-2.5 text-right", CELL)}>{usd(p)}</td>
                        <td data-label="Value" className={clsx("num py-2.5 text-right font-medium", CELL)}>{usd(val)}</td>
                        <td data-label="P&L" className={clsx("num py-2.5 text-right", CELL, signTone(pnl / h.cost, 0.005))}>
                          <span>{usd(pnl)} <span className="text-xs opacity-70">({pct(pnl / h.cost, 1)})</span></span>
                        </td>
                        <td className="py-2.5 pl-4 pr-4 text-right max-sm:block max-sm:pt-2">
                          <button
                            type="button"
                            onClick={() => sellAll(id)}
                            aria-label={`Sell all ${num(h.units, h.units % 1 ? 2 : 0)} ${a.ticker}`}
                            title={`Sell all units at the pool price, about ${usd(val)} before slippage`}
                            className="cursor-pointer inline-flex min-h-11 items-center whitespace-nowrap rounded border border-line-2 px-3 text-xs font-medium text-muted hover:border-down/50 hover:text-down max-sm:w-full max-sm:justify-center sm:min-h-8"
                          >
                            Sell all
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <h2 className="h-panel px-4 pt-4">Open predictions</h2>
            {s.positions.length === 0 ? (
              <Empty>
                No open predictions. <Link href="/predictions" className="cursor-pointer text-accent">Browse markets →</Link>
              </Empty>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {s.positions.map((p) => {
                  const seed = PREDICTIONS.find((x) => x.id === p.marketId)!;
                  const yp = yesPrice(s.predictions[p.marketId].pool);
                  const px = p.side === "YES" ? yp : 1 - yp;
                  const val = p.shares * px;
                  return (
                    <li key={p.marketId + p.side} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-xs font-semibold",
                          p.side === "YES" ? "bg-up/15 text-up" : "bg-down/15 text-down",
                        )}
                      >
                        {p.side}
                      </span>
                      <Link href={`/predictions/${p.marketId}`} className="cursor-pointer min-w-0 flex-1 hover:text-accent">
                        {seed.question}
                      </Link>
                      <span className="num basis-full text-xs text-muted sm:basis-auto">
                        {num(p.shares, 1)} sh · avg {cents(p.cost / p.shares)} · now {cents(px)} · cost {usd(p.cost)} · pays{" "}
                        {usd(p.shares)} if right
                      </span>
                      <span className={clsx("num w-24 text-right max-sm:ml-auto", signTone(val / p.cost - 1, 0.03))}>
                        {usd(val)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {s.settled.length > 0 && (
            <div className="panel">
              <div className="flex items-center gap-2 px-4 pt-4">
                <h2 className="h-panel">Settled predictions</h2>
                <SimBadge quiet>Settled in simulation</SimBadge>
              </div>
              <ul className="mt-2 divide-y divide-line">
                {s.settled.map((x) => {
                  const seed = PREDICTIONS.find((q) => q.id === x.marketId);
                  const won = x.side === x.outcome;
                  const pnl = x.payout - x.cost;
                  return (
                    <li key={`${x.marketId}${x.side}${x.ts}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-xs font-semibold",
                          x.side === "YES" ? "bg-up/15 text-up" : "bg-down/15 text-down",
                        )}
                      >
                        {x.side}
                      </span>
                      <span className="min-w-0 flex-1">{seed?.question ?? x.marketId}</span>
                      <span className="num basis-full text-xs text-muted sm:basis-auto">
                        Settled {x.outcome} · {won ? "won" : "lost"} · staked {usd(x.cost)} · paid {usd(x.payout)}
                      </span>
                      <span className={clsx("num w-24 text-right max-sm:ml-auto", pnl >= 0 ? "text-up" : "text-down")}>
                        {pnl >= 0 ? "+" : "-"}
                        {usd(Math.abs(pnl))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div id="trade-history" className="panel scroll-mt-20 overflow-x-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
              <h2 className="h-panel">Trade history</h2>
              {!connected && !nearAccount && s.trades.length > 0 && (
                <span className="text-xs text-muted">Connect a wallet to sign on-chain receipts for these trades.</span>
              )}
            </div>
            {s.trades.length === 0 ? (
              <Empty>No trades yet.</Empty>
            ) : (
              <table className="mt-2 w-full text-sm max-sm:block max-sm:[&>tbody]:block sm:min-w-[760px]">
                <thead className="max-sm:hidden">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 pl-4 font-medium">Time</th>
                    <th className="py-2 font-medium">Side</th>
                    <th className="py-2 font-medium">Market</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Total</th>
                    <th className="py-2 text-right font-medium">Solana receipt</th>
                    <th className="py-2 pr-4 text-right font-medium">NEAR receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {s.trades.slice(0, 50).map((t) => (
                    <tr key={t.id} className="border-t border-line max-sm:block max-sm:py-2">
                      <td data-label="Time" className={clsx("py-2 pl-4 text-xs text-muted", CELL)}>{timeAgo(t.ts)}</td>
                      <td data-label="Side" className={clsx("py-2", CELL)}>
                        <span
                          className={clsx(
                            "text-xs font-semibold",
                            t.kind === "BUY" || t.kind === "YES" || t.kind === "PAYOUT" ? "text-up" : "text-down",
                          )}
                        >
                          {t.kind}
                        </span>
                      </td>
                      <td data-label="Market" className={clsx("max-w-[280px] py-2 text-xs max-sm:max-w-none", CELL)}>
                        <TradeMarket t={t} />
                      </td>
                      <td data-label="Qty" className={clsx("num py-2 text-right text-xs", CELL)}>{t.kind === "BUY" || t.kind === "SELL" ? num(t.qty, t.qty % 1 ? 2 : 0) : num(t.qty, 1)}</td>
                      <td data-label="Price" className={clsx("num py-2 text-right text-xs", CELL)}>
                        {t.kind === "YES" || t.kind === "NO" ? cents(t.price) : usd(t.price)}
                      </td>
                      <td data-label="Total" className={clsx("num py-2 text-right text-xs", CELL)}>{usd(t.total)}</td>
                      <td data-label="Solana receipt" className={clsx("py-2 text-right text-xs", CELL)}>
                        {t.sig && t.sigStatus === "confirmed" ? (
                          <a
                            href={explorerTx(t.sig)}
                            target="_blank"
                            rel="noreferrer"
                            className="cursor-pointer inline-flex items-center gap-1 text-sol hover:underline"
                          >
                            {t.sig.slice(0, 8)}… <ExternalLink size={11} />
                          </a>
                        ) : t.sigStatus === "pending" ? (
                          <span className="inline-flex items-center gap-1 text-muted">
                            <Loader2 size={11} className="animate-spin" /> confirming
                          </span>
                        ) : connected && t.kind !== "PAYOUT" ? (
                          <button onClick={() => notarize(t)} className="cursor-pointer text-sol hover:underline">
                            {t.sigStatus === "failed" ? "Retry" : "Record"}
                          </button>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td data-label="NEAR receipt" className={clsx("py-2 pr-4 text-right text-xs", CELL)}>
                        {t.nearTx && t.nearStatus === "confirmed" ? (
                          <a
                            href={nearTxUrl(t.nearTx)}
                            target="_blank"
                            rel="noreferrer"
                            className="cursor-pointer inline-flex items-center gap-1 text-near hover:underline"
                          >
                            {t.nearTx.slice(0, 8)}… <ExternalLink size={11} />
                          </a>
                        ) : t.nearStatus === "pending" ? (
                          <span className="inline-flex items-center gap-1 text-muted">
                            <Loader2 size={11} className="animate-spin" /> signing
                          </span>
                        ) : nearAccount && t.kind !== "PAYOUT" ? (
                          <button
                            onClick={() => nearNotarize(t, t.sig ? `solana:devnet:${t.sig}` : undefined)}
                            className="cursor-pointer text-near hover:underline"
                          >
                            {t.nearStatus === "failed" ? "Retry" : "Record"}
                          </button>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </>
          )}
        </div>

        <aside className="panel h-fit p-4">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-muted" />
            <h2 className="h-panel">Leaderboard vs bots</h2>
            <SimBadge quiet>Bots</SimBadge>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Seven scripted bot accounts, not real traders. Your season return is ranked against them.
          </p>
          <ol className="mt-3 space-y-1">
            {leaderboard.map((r, i) => (
              <li
                key={r.name}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm",
                  "you" in r && r.you && "bg-accent/10 ring-1 ring-accent/30",
                )}
              >
                <span className="num w-5 text-xs text-muted">{i + 1}</span>
                <span className="flex-1 truncate">
                  {r.name}
                  {"you" in r && r.you && <span className="ml-1.5 text-xs font-semibold text-accent">YOU</span>}
                </span>
                <span className={clsx("num text-xs", signTone(r.ret))}>{pct(r.ret, 1)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>
    </div>
  );
}

function Card({ label, value, sub, big }: { label: string; value: React.ReactNode; sub?: React.ReactNode; big?: boolean }) {
  return (
    <div className={clsx("panel p-4", big && "col-span-2 lg:col-span-1")}>
      <div className="label">{label}</div>
      <div className={clsx("num mt-1.5 font-semibold", big ? "text-2xl" : "text-lg")}>{value}</div>
      {sub && <div className="num mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

/** Trade history "Market" cell: spot trades read title + ticker, prediction trades read the question, each tagged. */
function TradeMarket({ t }: { t: Trade }) {
  const spot = t.kind === "BUY" || t.kind === "SELL";
  const asset = spot ? ASSET_BY_ID[t.refId] : undefined;
  const question = spot ? undefined : (PREDICTIONS.find((p) => p.id === t.refId)?.question ?? t.label);
  const href = spot ? `/asset/${t.refId}` : `/predictions/${t.refId}`;
  const name = asset ? asset.title : (question ?? t.label);
  return (
    <Link href={href} className="cursor-pointer group block min-w-0 flex-1 max-sm:text-right" title={name}>
      <span className="block truncate text-[13px] text-text group-hover:text-accent">{name}</span>
      <span className="block truncate text-xs text-muted">
        {spot ? (
          <>
            Title · <span className="font-semibold text-text/80">{asset?.ticker ?? t.label}</span>
          </>
        ) : (
          "Prediction"
        )}
      </span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-6 pt-4 text-sm text-muted">{children}</div>;
}
