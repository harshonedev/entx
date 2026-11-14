"use client";

import Link from "next/link";
import clsx from "clsx";
import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink, Loader2, RotateCcw, Trophy } from "lucide-react";
import { ASSET_BY_ID } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { yesPrice } from "@/lib/engine";
import { STARTING_CASH, portfolioValue, priceOf, useMarket } from "@/store/market";
import { explorerTx, num, pct, shortKey, timeAgo, usd } from "@/lib/format";
import { useNotarize } from "@/lib/solana";
import { useNear, useNearNotarize } from "@/lib/near";
import { nearTxUrl } from "@/lib/near-config";
import { Poster } from "@/components/poster";
import { SimBadge } from "@/components/ui";

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

  const leaderboard = [...BOTS, { name: nearAccount ?? (publicKey ? shortKey(publicKey.toBase58()) : "demo-trader"), ret, you: true }].sort(
    (a, b) => b.ret - a.ret,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Portfolio</h1>
            <SimBadge>Virtual balance</SimBadge>
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
        <button
          onClick={() => confirm("Reset the demo? This clears trades and restores markets.") && s.reset()}
          className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-text"
        >
          <RotateCcw size={13} /> Reset demo
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Total value" value={usd(v.total)} sub={<span className={ret >= 0 ? "text-up" : "text-down"}>{pct(ret)} all-time</span>} big />
        <Card label="Available cash" value={usd(s.cash)} />
        <Card label="Holdings" value={usd(v.holdings)} />
        <Card label="Predictions" value={usd(v.preds)} />
        <Card
          label="P&L (unrealized · realized)"
          value={
            <span>
              <span className={v.unrealized >= 0 ? "text-up" : "text-down"}>{usd(v.unrealized)}</span>
              <span className="text-faint"> · </span>
              <span className={s.realized >= 0 ? "text-up" : "text-down"}>{usd(s.realized)}</span>
            </span>
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="panel overflow-x-auto">
            <div className="h-panel px-4 pt-4">Holdings</div>
            {Object.keys(s.holdings).length === 0 ? (
              <Empty>
                No holdings yet. <Link href="/" className="cursor-pointer text-accent">Discover titles to trade →</Link>
              </Empty>
            ) : (
              <table className="mt-2 w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-2 pl-4 font-medium">Asset</th>
                    <th className="py-2 text-right font-medium">Units</th>
                    <th className="py-2 text-right font-medium">Avg cost</th>
                    <th className="py-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Value</th>
                    <th className="py-2 pr-4 text-right font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(s.holdings).map(([id, h]) => {
                    const a = ASSET_BY_ID[id];
                    const p = priceOf(s.markets[id]);
                    const val = h.units * p;
                    const pnl = val - h.cost;
                    return (
                      <tr key={id} className="border-t border-line">
                        <td className="py-2.5 pl-4">
                          <Link href={`/asset/${id}`} className="cursor-pointer flex items-center gap-3 hover:text-accent">
                            <Poster asset={a} size="sm" />
                            <div>
                              <div className="font-medium">{a.ticker}</div>
                              <div className="text-xs text-muted">{a.title}</div>
                            </div>
                          </Link>
                        </td>
                        <td className="num py-2.5 text-right">{num(h.units, h.units % 1 ? 2 : 0)}</td>
                        <td className="num py-2.5 text-right text-muted">{usd(h.cost / h.units)}</td>
                        <td className="num py-2.5 text-right">{usd(p)}</td>
                        <td className="num py-2.5 text-right font-medium">{usd(val)}</td>
                        <td className={clsx("num py-2.5 pr-4 text-right", pnl >= 0 ? "text-up" : "text-down")}>
                          {usd(pnl)} <span className="text-xs opacity-70">({pct(pnl / h.cost, 1)})</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <div className="h-panel px-4 pt-4">Open predictions</div>
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
                      <span className="min-w-0 flex-1">{seed.question}</span>
                      <span className="num text-xs text-muted">
                        {num(p.shares, 1)} sh @ {(px * 100).toFixed(0)}¢
                      </span>
                      <span className={clsx("num w-24 text-right", val >= p.cost ? "text-up" : "text-down")}>
                        {usd(val)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="panel overflow-x-auto">
            <div className="h-panel px-4 pt-4">Trade history</div>
            {s.trades.length === 0 ? (
              <Empty>No trades yet.</Empty>
            ) : (
              <table className="mt-2 w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
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
                    <tr key={t.id} className="border-t border-line">
                      <td className="py-2 pl-4 text-xs text-muted">{timeAgo(t.ts)}</td>
                      <td className="py-2">
                        <span
                          className={clsx(
                            "text-xs font-semibold",
                            t.kind === "BUY" || t.kind === "YES" || t.kind === "PAYOUT" ? "text-up" : "text-down",
                          )}
                        >
                          {t.kind}
                        </span>
                      </td>
                      <td className="max-w-[260px] truncate py-2 text-xs">{t.label}</td>
                      <td className="num py-2 text-right text-xs">{num(t.qty, t.qty % 1 ? 2 : 0)}</td>
                      <td className="num py-2 text-right text-xs">
                        {t.kind === "YES" || t.kind === "NO" ? `${(t.price * 100).toFixed(1)}¢` : usd(t.price)}
                      </td>
                      <td className="num py-2 text-right text-xs">{usd(t.total)}</td>
                      <td className="py-2 text-right text-xs">
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
                      <td className="py-2 pr-4 text-right text-xs">
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
        </div>

        <aside className="panel h-fit p-4">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-accent" />
            <span className="h-panel">Leaderboard · season return</span>
          </div>
          <ol className="mt-3 space-y-1">
            {leaderboard.map((r, i) => (
              <li
                key={r.name}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm",
                  "you" in r && r.you && "bg-accent/10 ring-1 ring-accent/30",
                )}
              >
                <span className="num w-5 text-xs text-faint">{i + 1}</span>
                <span className="flex-1 truncate">
                  {r.name}
                  {"you" in r && r.you && <span className="ml-1.5 text-[11px] font-semibold text-accent">YOU</span>}
                </span>
                <span className={clsx("num text-xs", r.ret >= 0 ? "text-up" : "text-down")}>{pct(r.ret, 1)}</span>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-6 pt-4 text-sm text-muted">{children}</div>;
}
