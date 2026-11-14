"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Clock, Gavel } from "lucide-react";
import { ASSET_BY_ID } from "@/lib/assets";
import type { PredictionSeed } from "@/lib/predictions";
import { quoteBinary, yesPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";
import { compactUsd, num, usd } from "@/lib/format";
import { useReceipts } from "@/lib/receipts";
import { Poster } from "./poster";
import { Flash } from "./ui";
import { NearStakePanel } from "./near-stake";

const AMOUNTS = [10, 25, 50, 100];

export function PredictionCard({ p, compact = false }: { p: PredictionSeed; compact?: boolean }) {
  const st = useMarket((s) => s.predictions[p.id]);
  const positions = useMarket((s) => s.positions);
  const cash = useMarket((s) => s.cash);
  const predict = useMarket((s) => s.predict);
  const resolve = useMarket((s) => s.resolve);
  const receipts = useReceipts();
  const [side, setSide] = useState<"YES" | "NO" | null>(null);
  const [amount, setAmount] = useState(25);

  const yp = yesPrice(st.pool);
  const asset = p.assetId ? ASSET_BY_ID[p.assetId] : undefined;
  const mine = positions.filter((x) => x.marketId === p.id);
  const q = side ? quoteBinary(st.pool, side, amount) : null;

  const place = () => {
    if (!side) return;
    const t = predict(p.id, side, amount);
    if (t) {
      setSide(null);
      if (receipts.any) void receipts.record(t);
    }
  };

  return (
    <div className="panel flex flex-col p-4">
      <div className="flex items-start gap-3">
        {asset && !compact && (
          <Link className="cursor-pointer" href={`/asset/${asset.id}`}>
            <Poster asset={asset} size="sm" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-medium text-text/80">{p.category}</span>
            {asset && <span className="font-semibold">{asset.ticker}</span>}
            <span className="ml-auto inline-flex items-center gap-1">
              <Clock size={11} /> {st.resolved ? "Closed" : `${p.closesInDays}d left`}
            </span>
          </div>
          <Link
            href={`/predictions/${p.id}`}
            className="cursor-pointer mt-1.5 block text-[15px] font-semibold leading-snug hover:text-accent"
          >
            {p.question}
          </Link>
        </div>
      </div>

      {/* Probability bar */}
      <div className="mt-4">
        <div className="flex items-end justify-between">
          <div className="num text-2xl font-semibold">
            <Flash value={yp}>{st.resolved ? st.resolved : `${(yp * 100).toFixed(0)}%`}</Flash>
            {!st.resolved && <span className="ml-1.5 text-xs font-normal text-muted">chance YES</span>}
          </div>
          <div className="text-xs text-muted">Vol {compactUsd(st.volume)}</div>
        </div>
        <div className="mt-2 flex h-1 overflow-hidden bg-down/40">
          <div className="h-full w-full origin-left bg-up motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out" style={{ transform: `scaleX(${yp})` }} />
        </div>
      </div>

      {st.resolved ? (
        <div
          className={clsx(
            "mt-4 rounded-xl border p-3 text-center text-sm font-semibold",
            st.resolved === "YES" ? "border-up/30 text-up" : "border-down/30 text-down",
          )}
        >
          Settled {st.resolved}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide(side === "YES" ? null : "YES")}
              className={clsx(
                "cursor-pointer rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                side === "YES" ? "border-up bg-up text-black" : "border-transparent bg-up/[0.08] text-up hover:bg-up/[0.14]",
              )}
            >
              Yes <span className="num font-normal opacity-80">{(yp * 100).toFixed(0)}¢</span>
            </button>
            <button
              onClick={() => setSide(side === "NO" ? null : "NO")}
              className={clsx(
                "cursor-pointer rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                side === "NO" ? "border-down bg-down text-black" : "border-transparent bg-down/[0.08] text-down hover:bg-down/[0.14]",
              )}
            >
              No <span className="num font-normal opacity-80">{((1 - yp) * 100).toFixed(0)}¢</span>
            </button>
          </div>

          {side && q && (
            <div className="mt-3 rounded bg-panel-2 p-3">
              <div className="grid grid-cols-4 gap-1.5">
                {AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a)}
                    className={clsx(
                      "cursor-pointer num rounded-lg border py-1.5 text-xs",
                      amount === a ? "border-accent text-accent" : "border-line text-muted hover:text-text",
                    )}
                  >
                    ${a}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-muted">Shares · avg</span>
                <span className="num">
                  {num(q.shares, 1)} @ {(q.avg * 100).toFixed(1)}¢
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-muted">Payout if {side}</span>
                <span className="num font-semibold text-up">{usd(q.shares)}</span>
              </div>
              <button
                disabled={amount > cash}
                onClick={place}
                className="cursor-pointer mt-3 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-accent-ink disabled:opacity-40"
              >
                {amount > cash ? "Insufficient balance" : `Buy ${side} · ${usd(amount, 0)}`}
              </button>
            </div>
          )}
        </>
      )}

      <NearStakePanel marketId={p.id} />

      {mine.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
          {mine.map((x) => (
            <div key={x.side} className="flex justify-between">
              <span className="text-muted">
                Your {x.side}: <span className="num text-text">{num(x.shares, 1)}</span> shares
              </span>
              <span className="num">
                {usd(x.shares * (x.side === "YES" ? yp : 1 - yp))}
              </span>
            </div>
          ))}
        </div>
      )}

      {!st.resolved && !compact && (
        <details className="group mt-auto pt-3 text-xs text-muted">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-faint hover:text-muted">
            <Gavel size={12} /> Rules & simulated settlement
          </summary>
          <p className="mt-2 leading-relaxed">{p.rules}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => resolve(p.id, "YES")} className="cursor-pointer rounded-md border border-line px-2 py-1 hover:text-up">
              Settle YES
            </button>
            <button onClick={() => resolve(p.id, "NO")} className="cursor-pointer rounded-md border border-line px-2 py-1 hover:text-down">
              Settle NO
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
