"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import {
  NEAR_CONTRACT,
  nearAccountUrl,
  nearView,
  resolvedOutcome,
  yoctoToNear,
  type NearMarket,
  type NearReceipt,
  type NearStats,
} from "@/lib/near-config";
import { MEMO_PROGRAM_ID } from "@/lib/solana";
import { useMarket } from "@/store/market";
import { explorerTx, timeAgo } from "@/lib/format";
import { IntentsPanel } from "@/components/intents-panel";

export default function OnchainPage() {
  const [stats, setStats] = useState<NearStats | null>(null);
  const [markets, setMarkets] = useState<NearMarket[]>([]);
  const [receipts, setReceipts] = useState<NearReceipt[]>([]);
  const [oracles, setOracles] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  const assets = markets.filter((m) => m.kind === "Asset");
  const preds = markets.filter((m) => m.kind === "Prediction");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">On-chain</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            What ENTX puts on-chain, read live from the chains. NEAR holds the market registry, EPI oracle reports,
            trade receipts and real-NEAR prediction pools. Solana devnet holds memo receipts. Intents route
            cross-chain funding.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-text"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="panel p-4 lg:col-span-2">
          <div className="h-panel">NEAR contract · testnet</div>
          <a
            href={nearAccountUrl(NEAR_CONTRACT)}
            target="_blank"
            rel="noreferrer"
            className="num mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-near hover:underline"
          >
            {NEAR_CONTRACT} <ExternalLink size={12} />
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <ShieldCheck size={12} className="text-near" /> Trusted oracles:
            {oracles.map((o) => (
              <span key={o} className="num rounded bg-white/[0.06] px-1.5 py-0.5 text-text/80">
                {o}
              </span>
            ))}
          </div>
        </div>
        <Kpi label="Markets registered" value={stats?.markets} />
        <Kpi label="Trade receipts" value={stats?.receipts} />
        <Kpi label="EPI reports · staked" value={stats ? `${stats.epi_reports} · ${yoctoToNear(stats.total_staked, 2)} Ⓝ` : undefined} />
      </section>
      {err && <div className="panel border-down/40 p-3 text-xs text-down">RPC error: {err}</div>}

      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="panel overflow-x-auto">
            <div className="h-panel px-4 pt-4">Asset markets · on-chain EPI vs live</div>
            <table className="mt-2 w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2 pl-4 font-medium">Market</th>
                  <th className="py-2 text-right font-medium">On-chain EPI</th>
                  <th className="py-2 text-right font-medium">App EPI</th>
                  <th className="py-2 text-right font-medium">Oracle updates</th>
                  <th className="py-2 text-right font-medium">Receipts</th>
                  <th className="py-2 pr-4 text-right font-medium">Notional</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-2 pl-4">
                      <Link href={`/asset/${m.id}`} className="hover:text-accent">
                        <span className="font-semibold">{m.ticker}</span>{" "}
                        <span className="text-xs text-muted">{m.title}</span>
                      </Link>
                    </td>
                    <td className="num py-2 text-right text-near">{(m.epi_x10 / 10).toFixed(1)}</td>
                    <td className="num py-2 text-right">{local[m.id]?.epi.toFixed(1) ?? "—"}</td>
                    <td className="num py-2 text-right text-muted">{m.oracle_updates}</td>
                    <td className="num py-2 text-right text-muted">{m.trades}</td>
                    <td className="num py-2 pr-4 text-right text-muted">${(m.volume_micro_usd / 1e6).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel overflow-x-auto">
            <div className="h-panel px-4 pt-4">Prediction pools · real testnet NEAR</div>
            <table className="mt-2 w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2 pl-4 font-medium">Market</th>
                  <th className="py-2 text-right font-medium">YES pool</th>
                  <th className="py-2 text-right font-medium">NO pool</th>
                  <th className="py-2 pr-4 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preds.map((m) => {
                  const o = resolvedOutcome(m.status);
                  return (
                    <tr key={m.id} className="border-t border-line">
                      <td className="max-w-[360px] truncate py-2 pl-4 text-xs">{m.title}</td>
                      <td className="num py-2 text-right text-up">{yoctoToNear(m.yes_pool, 2)} Ⓝ</td>
                      <td className="num py-2 text-right text-down">{yoctoToNear(m.no_pool, 2)} Ⓝ</td>
                      <td className="py-2 pr-4 text-right text-xs">
                        {o === null ? <span className="text-muted">Open</span> : <span className={o ? "text-up" : "text-down"}>Resolved {o ? "YES" : "NO"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="panel overflow-x-auto">
            <div className="h-panel px-4 pt-4">Latest NEAR trade receipts (all traders)</div>
            {receipts.length === 0 ? (
              <div className="px-4 pb-5 pt-3 text-sm text-muted">
                No receipts yet. Connect a NEAR wallet and place a trade.
              </div>
            ) : (
              <table className="mt-2 w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
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
                  {receipts.map((r) => {
                    const solSig = r.chain_ref?.startsWith("solana:devnet:") ? r.chain_ref.slice(14) : null;
                    const isPred = r.side === "YES" || r.side === "NO";
                    return (
                      <tr key={r.id} className="border-t border-line text-xs">
                        <td className="num py-2 pl-4 text-faint">{r.id}</td>
                        <td className="num max-w-[160px] truncate py-2">
                          <a href={nearAccountUrl(r.account)} target="_blank" rel="noreferrer" className="hover:text-near">
                            {r.account}
                          </a>
                        </td>
                        <td className="py-2">{r.market_id}</td>
                        <td className="py-2 font-semibold">{r.side}</td>
                        <td className="num py-2 text-right">
                          {(r.qty_micro / 1e6).toFixed(2)} @{" "}
                          {isPred ? `${((r.price_micro / 1e6) * 100).toFixed(1)}¢` : `$${(r.price_micro / 1e6).toFixed(2)}`}
                        </td>
                        <td className="py-2 pl-4">
                          {solSig ? (
                            <a href={explorerTx(solSig)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sol hover:underline">
                              Solana {solSig.slice(0, 6)}… <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right text-faint">{timeAgo(r.ts_ms)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <IntentsPanel />
          <div className="panel p-4 text-xs leading-relaxed text-muted">
            <div className="h-panel mb-2">Solana devnet</div>
            Each trade can also be signed as a JSON memo through the SPL Memo program{" "}
            <span className="num break-all text-text/80">{MEMO_PROGRAM_ID.toBase58()}</span>. When both wallets are
            connected, the NEAR receipt stores the Solana signature in <code>chain_ref</code>, linking the two
            records.
          </div>
        </aside>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="num mt-1.5 text-xl font-semibold">{value ?? "—"}</div>
    </div>
  );
}
