"use client";

import { CHAIN_ON } from "@/lib/env";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import {
  NEAR_CONTRACT,
  nearAccountUrl,
  nearTxUrl,
  nearView,
  resolvedOutcome,
  yoctoToNear,
  type NearMarket,
  type NearReceipt,
  type NearStats,
} from "@/lib/near-config";
import { MEMO_PROGRAM_ID } from "@/lib/solana";
import { useMarket } from "@/store/market";
import { ASSETS } from "@/lib/assets";
import { cents, explorerTx, timeAgo } from "@/lib/format";
import { IntentsPanel } from "@/components/intents-panel";
import { APP_MARKET_IDS, marketCounts } from "@/components/onchain-epi";
import { RealBadge, STACK_CELL as CELL, ShowAllRows, useMobileRowCap } from "@/components/ui";
import clsx from "clsx";

export default function OnchainPage() {
  const [stats, setStats] = useState<NearStats | null>(null);
  const [markets, setMarkets] = useState<NearMarket[]>([]);
  const [receipts, setReceipts] = useState<NearReceipt[]>([]);
  const [oracles, setOracles] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Phones show a few rows per table (stacked cards are tall); the rest is one tap away.
  const local = useMarket((s) => s.markets);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m, r, o] = await Promise.all([
        nearView<NearStats>("get_stats"),
        nearView<NearMarket[]>("get_markets", { from_index: 0, limit: 100 }),
        nearView<NearReceipt[]>("get_recent_receipts", { limit: 20 }),
        nearView<string[]>("get_oracles"),
      ]);
      setStats(s);
      setMarkets(m);
      setReceipts(r);
      setOracles(o);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  // The registry is append-only; markets from earlier catalogues stay on-chain but aren't traded anymore.
  // Counted the same way as the home proof strip (marketCounts), so the two pages never disagree.
  const live = markets.filter((m) => APP_MARKET_IDS.has(m.id));
  const counts = stats ? marketCounts(stats, markets) : null;
  const assets = live.filter((m) => m.kind === "Asset");
  const preds = live.filter((m) => m.kind === "Prediction");
  // The contract can hold markets from older catalogues; say so instead of rendering a blank table.
  const emptyText = (noun: string) =>
    err
      ? "Couldn't reach NEAR testnet. Try Refresh."
      : markets.length === 0
        ? "Reading the NEAR contract…"
        : `No ${noun} from this app's catalogue on the contract yet.`;
  const assetCap = useMobileRowCap(assets.length, "markets");
  const poolCap = useMobileRowCap(preds.length, "pools");
  const receiptCap = useMobileRowCap(receipts.length, "receipts");
  // Where the empty-state CTA sends a visitor: the same spotlight title the home page leads with.
  const spot =
    [...ASSETS].filter((a) => a.status === "In theaters").sort((a, b) => (local[b.id]?.epi ?? 0) - (local[a.id]?.epi ?? 0))[0] ??
    ASSETS[0];
  const loaded = stats !== null;

  return (
    <div className="space-y-5">
      <div className="masthead">
        <div>
          <h1 className="h-display">On-chain</h1>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted">
            What ENTX puts on-chain, read live from the chains. NEAR holds the market registry, EPI oracle reports,
            trade receipts and on-chain prediction pools in testnet NEAR. Intents route cross-chain funding.
          </p>
        </div>
        <button
          onClick={load}
          className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-text pointer-coarse:min-h-11"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="panel col-span-2 p-4">
          <div className="flex items-center gap-2">
            <h2 className="h-panel">NEAR contract</h2>
            <RealBadge />
          </div>
          <a
            href={nearAccountUrl(NEAR_CONTRACT)}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer num mt-1.5 inline-flex items-center gap-1.5 break-all text-sm font-semibold text-near hover:underline pointer-coarse:min-h-11"
          >
            {NEAR_CONTRACT} <ExternalLink size={12} />
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={12} className="text-near" /> Trusted oracles:
            {oracles.length === 0 && <span className="text-faint">{err ? "unavailable, try Refresh" : "reading contract…"}</span>}
            {oracles.map((o) => {
              // The contract allow-lists its owner as the first oracle at deploy; say so instead of hiding it.
              const role = o === stats?.owner ? "contract owner" : null;
              return (
                <a
                  key={o}
                  href={nearAccountUrl(o)}
                  target="_blank"
                  rel="noreferrer"
                  className="cursor-pointer num inline-flex items-center text-text/80 hover:text-near pointer-coarse:min-h-11"
                >
                  <span className="inline-flex items-center gap-1 rounded bg-ink/[0.07] px-1.5 py-0.5">
                    {o}
                    {role && <span className="font-sans text-faint">· {role}</span>}
                    <ExternalLink size={10} aria-hidden />
                  </span>
                </a>
              );
            })}
          </div>
          {oracles.some((o) => o === stats?.owner) && oracles.length > 1 && (
            <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-faint">
              The owner is allow-listed at deploy. News-driven EPI reports are signed by the dedicated oracle account,
              whose key can only call <code>report_epi</code>.
            </p>
          )}
        </div>
        <Kpi
          label="Markets registered on NEAR"
          value={counts?.registered}
          sub={
            counts
              ? `${counts.listed} listed in app${counts.legacy ? ` · ${counts.legacy} from earlier catalogues, no longer traded` : ""}`
              : undefined
          }
        />
        <Kpi
          label="EPI reports"
          value={stats?.epi_reports}
          sub="report_epi calls by trusted oracles"
          href={oracles[0] ? nearAccountUrl(oracles.find((o) => o !== stats?.owner) ?? oracles[0]) : undefined}
        />
        <Kpi
          label="Trade receipts"
          value={stats?.receipts}
          sub="record_trade calls, self-reported by traders"
          href={stats?.receipts ? nearAccountUrl(NEAR_CONTRACT) : undefined}
          cta={stats?.receipts === 0 ? { href: `/asset/${spot.id}`, label: "Make the first trade" } : undefined}
        />
        <Kpi
          label="Staked in pools"
          value={stats ? `${yoctoToNear(stats.total_staked, 2)} Ⓝ` : undefined}
          sub="Testnet NEAR, on-chain"
          cta={stats && BigInt(stats.total_staked || "0") === BigInt(0) ? { href: "/predictions", label: "Stake on a prediction" } : undefined}
        />
      </section>
      {err && <div className="panel border-down/40 p-3 text-xs text-down">RPC error: {err}</div>}

      <section className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="panel scroll-mt-20 overflow-x-auto">
            <h2 className="h-panel px-4 pt-4">Asset markets · Oracle EPI vs App EPI</h2>
            <p className="max-w-prose px-4 pt-1 text-xs leading-relaxed text-muted">
              Oracle EPI is the last value the trusted oracle published to NEAR: the title&apos;s TMDB baseline
              adjusted by the latest news event, never accumulated across visitors. App EPI is this browser&apos;s own
              simulation, which adds up every news event you fire, so the two can drift apart. Your latest oracle
              transaction is linked under &ldquo;Your last report&rdquo;.
            </p>
            <table id={assetCap.tableId} className="mt-2 w-full text-sm max-sm:block max-sm:[&>tbody]:block sm:min-w-[620px]">
              <thead className="max-sm:hidden">
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pl-4 font-medium">Market</th>
                  <th className="py-2 text-right font-medium">Oracle EPI · NEAR</th>
                  <th className="py-2 text-right font-medium">App EPI</th>
                  <th className="hidden py-2 pl-4 text-right font-medium sm:table-cell">Oracle updates</th>
                  <th className="hidden py-2 pl-4 text-right font-medium sm:table-cell">Receipts</th>
                  <th className="hidden py-2 text-right font-medium sm:table-cell" title="Sum of receipts traders filed themselves; not settled volume">Reported size</th>
                  <th className="py-2 pr-4 text-right font-medium">Your last report</th>
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 && (
                  <tr className="border-t border-line max-sm:block">
                    <td colSpan={7} className="px-4 py-4 text-xs text-muted max-sm:block" role="status">
                      {emptyText("markets")}
                    </td>
                  </tr>
                )}
                {assets.map((m, i) => (
                  <tr
                    key={m.id}
                    className={clsx("border-t border-line max-sm:py-2", assetCap.rowClass(i))}
                  >
                    <td className="py-2 pl-4 max-sm:block max-sm:px-4">
                      <Link href={`/asset/${m.id}`} className="cursor-pointer inline-flex items-center gap-1.5 hover:text-accent pointer-coarse:min-h-11">
                        <span className="font-semibold">{m.ticker}</span>{" "}
                        <span className="text-xs text-muted">{m.title}</span>
                      </Link>
                    </td>
                    <td data-label="Oracle EPI · NEAR" className={clsx("num py-2 text-right text-near", CELL)}>{(m.epi_x10 / 10).toFixed(1)}</td>
                    <td data-label="App EPI" className={clsx("num py-2 text-right", CELL)}>{local[m.id]?.epi.toFixed(1) ?? "—"}</td>
                    <td className="num hidden py-2 text-right text-muted sm:table-cell">{m.oracle_updates}</td>
                    <td className="num hidden py-2 text-right text-muted sm:table-cell">{m.trades}</td>
                    <td className="num hidden py-2 text-right text-muted sm:table-cell">${(m.volume_micro_usd / 1e6).toFixed(2)}</td>
                    <td data-label="Your last report" className={clsx("py-2 pr-4 text-right text-xs", CELL)}>
                      {local[m.id]?.oracleTx ? (
                        <a
                          href={nearTxUrl(local[m.id].oracleTx!)}
                          target="_blank"
                          rel="noreferrer"
                          className="cursor-pointer inline-flex items-center gap-1 text-near hover:underline pointer-coarse:min-h-11"
                        >
                          {local[m.id].oracleTx!.slice(0, 6)}… <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ShowAllRows {...assetCap.toggle} />
          </div>

          <div className="panel scroll-mt-20 overflow-x-auto">
            <div className="flex items-center gap-2 px-4 pt-4">
              <h2 className="h-panel">Prediction pools</h2>
              <RealBadge />
            </div>
            <p className="max-w-prose px-4 pt-1 text-xs leading-relaxed text-muted">
              Testnet NEAR (no monetary value) staked on YES or NO through the contract. The simulated odds elsewhere in the app don&apos;t
              touch these pools, and settling a market from Demo controls only settles the simulation: a pool here stays
              Open until the contract&apos;s resolver settles it on-chain.
            </p>
            <table id={poolCap.tableId} className="mt-2 w-full text-sm max-sm:block max-sm:[&>tbody]:block sm:min-w-[620px]">
              <thead className="max-sm:hidden">
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pl-4 font-medium">Market</th>
                  <th className="py-2 text-right font-medium">YES pool</th>
                  <th className="py-2 text-right font-medium">NO pool</th>
                  <th className="py-2 pr-4 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preds.length === 0 && (
                  <tr className="border-t border-line max-sm:block">
                    <td colSpan={4} className="px-4 py-4 text-xs text-muted max-sm:block" role="status">
                      {emptyText("prediction pools")}
                    </td>
                  </tr>
                )}
                {preds.map((m, i) => {
                  const o = resolvedOutcome(m.status);
                  return (
                    <tr
                      key={m.id}
                      className={clsx("border-t border-line max-sm:py-2", poolCap.rowClass(i))}
                    >
                      <td className="py-2 pl-4 text-xs max-sm:block max-sm:px-4 sm:max-w-[360px] sm:truncate">
                        <Link href={`/predictions/${m.id}`} className="cursor-pointer inline-flex items-center hover:text-accent pointer-coarse:min-h-11">
                          {m.title}
                        </Link>
                      </td>
                      <td data-label="YES pool" className={clsx("num py-2 text-right text-up", CELL)}>{yoctoToNear(m.yes_pool, 2)} Ⓝ</td>
                      <td data-label="NO pool" className={clsx("num py-2 text-right text-down", CELL)}>{yoctoToNear(m.no_pool, 2)} Ⓝ</td>
                      <td data-label="Status" className={clsx("py-2 pr-4 text-right text-xs", CELL)}>
                        {o === null ? <span className="text-muted">Open</span> : <span className={o ? "text-up" : "text-down"}>Resolved {o ? "YES" : "NO"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ShowAllRows {...poolCap.toggle} />
          </div>

          <div className="panel scroll-mt-20 overflow-x-auto">
            <h2 className="h-panel px-4 pt-4">Latest NEAR trade receipts (all traders)</h2>
            {!loaded && receipts.length === 0 ? (
              <p className="px-4 pb-5 pt-3 text-sm text-muted">
                {err ? "Couldn't read receipts from NEAR testnet." : "Reading receipts…"}
              </p>
            ) : receipts.length === 0 ? (
              <div className="px-4 pb-5 pt-3">
                <p className="text-sm text-text">No trade receipts on this contract yet.</p>
                <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">
                  With a NEAR wallet connected, every buy, sell or bet calls <code>record_trade</code> and lands here with
                  a NearBlocks link.
                </p>
                <Link
                  href={`/asset/${spot.id}`}
                  className="btn-primary cursor-pointer press mt-3 h-9 px-4 text-[15px] pointer-coarse:h-11"
                >
                  Make a trade to write the first receipt <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            ) : (
              <table id={receiptCap.tableId} className="mt-2 w-full text-sm max-sm:block max-sm:[&>tbody]:block sm:min-w-[680px]">
                <thead className="max-sm:hidden">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 pl-4 font-medium">#</th>
                    <th className="py-2 font-medium">Trader</th>
                    <th className="py-2 font-medium">Market</th>
                    <th className="py-2 font-medium">Side</th>
                    <th className="py-2 text-right font-medium">Qty @ price</th>
                    <th className="py-2 font-medium pl-4">Cross-chain ref</th>
                    <th className="py-2 pr-4 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r, i) => {
                    const solSig = r.chain_ref?.startsWith("solana:devnet:") ? r.chain_ref.slice(14) : null;
                    const isPred = r.side === "YES" || r.side === "NO";
                    return (
                      <tr
                        key={r.id}
                        className={clsx("border-t border-line text-xs max-sm:py-2", receiptCap.rowClass(i))}
                      >
                        <td data-label="#" className={clsx("num py-2 pl-4 text-faint", CELL)}>{r.id}</td>
                        <td data-label="Trader" data-truncate className={clsx("num max-w-[160px] truncate py-2 max-sm:max-w-none", CELL)}>
                          <a
                            href={nearAccountUrl(r.account)}
                            target="_blank"
                            rel="noreferrer"
                            className="cursor-pointer hover:text-near max-sm:leading-[44px]"
                          >
                            {r.account}
                          </a>
                        </td>
                        <td data-label="Market" className={clsx("py-2", CELL)}>{r.market_id}</td>
                        <td data-label="Side" className={clsx("py-2 font-semibold", CELL)}>{r.side}</td>
                        <td data-label="Qty @ price" className={clsx("num py-2 text-right", CELL)}>
                          {(r.qty_micro / 1e6).toFixed(2)} @{" "}
                          {isPred ? cents(r.price_micro / 1e6) : `$${(r.price_micro / 1e6).toFixed(2)}`}
                        </td>
                        <td data-label="Cross-chain ref" className={clsx("py-2 pl-4", CELL)}>
                          {solSig ? (
                            <a href={explorerTx(solSig)} target="_blank" rel="noreferrer" className="cursor-pointer inline-flex items-center gap-1 text-sol hover:underline pointer-coarse:min-h-11">
                              Solana {solSig.slice(0, 6)}… <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td data-label="When" className={clsx("py-2 pr-4 text-right text-faint", CELL)}>{timeAgo(r.ts_ms)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <ShowAllRows {...receiptCap.toggle} />
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <IntentsPanel />
          {CHAIN_ON.solana && (
          <div className="panel p-4 text-xs leading-relaxed text-muted">
            <h2 className="h-panel mb-2">Solana devnet</h2>
            Each trade can also be signed as a JSON memo through the SPL Memo program{" "}
            <span className="num break-all text-text/80">{MEMO_PROGRAM_ID.toBase58()}</span>. When both wallets are
            connected, the NEAR receipt stores the Solana signature in <code>chain_ref</code>, linking the two
            records.
          </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  href,
  cta,
}: {
  label: string;
  value?: number | string;
  sub?: string;
  href?: string;
  /** Shown when the real count is zero: the action that would make it non-zero. */
  cta?: { href: string; label: string };
}) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="num mt-1.5 text-xl font-semibold">{value ?? "—"}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="cursor-pointer mt-1.5 inline-flex min-h-6 items-center gap-1 text-xs text-near hover:underline pointer-coarse:min-h-11"
        >
          View on NearBlocks <ExternalLink size={10} />
        </a>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="cursor-pointer mt-1.5 inline-flex min-h-6 items-center gap-1 text-xs text-accent hover:underline pointer-coarse:min-h-11"
        >
          {cta.label} <ArrowRight size={11} aria-hidden />
        </Link>
      )}
    </div>
  );
}
