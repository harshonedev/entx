"use client";

import { poolPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";
import { num, usd } from "@/lib/format";

const LEVELS = 7;
const STEP = 0.0025;

/** Depth derived from the AMM curve: size = units needed to move price to each level. */
export function OrderBook({ assetId }: { assetId: string }) {
  const pool = useMarket((s) => s.markets[assetId].pool);
  const k = pool.cash * pool.units;
  const p0 = poolPrice(pool);
  const unitsAt = (p: number) => Math.sqrt(k / p);

  const build = (dir: 1 | -1) => {
    const rows: { price: number; size: number; cum: number }[] = [];
    let cum = 0;
    for (let i = 1; i <= LEVELS; i++) {
      const pa = p0 * (1 + dir * STEP * (i - 1));
      const pb = p0 * (1 + dir * STEP * i);
      const size = Math.abs(unitsAt(pa) - unitsAt(pb));
      cum += size;
      rows.push({ price: pb, size, cum });
    }
    return rows;
  };
  const asks = build(1).reverse();
  const bids = build(-1);
  const max = Math.max(...asks.map((r) => r.cum), ...bids.map((r) => r.cum));

  const Row = ({ r, side }: { r: { price: number; size: number; cum: number }; side: "ask" | "bid" }) => (
    <tr className="relative text-xs">
      <td className="num relative py-[3px] pl-3">
        <span
          aria-hidden
          className={side === "ask" ? "absolute inset-y-0 left-0 bg-down/10" : "absolute inset-y-0 left-0 bg-up/10"}
          style={{ width: `${(r.cum / max) * 300}%` }}
        />
        <span className={`relative ${side === "ask" ? "text-down" : "text-up"}`}>
          <span className="sr-only">{side === "ask" ? "Sell at " : "Buy at "}</span>
          {num(r.price)}
        </span>
      </td>
      <td className="num relative py-[3px] text-right text-muted">{num(r.size, 0)}</td>
      <td className="num relative py-[3px] pr-3 text-right text-muted">{num(r.cum, 0)}</td>
    </tr>
  );

  // Collapsed by default: the pool's depth is smooth by construction, so it's reference, not signal.
  return (
    <details className="panel group overflow-hidden">
      <summary className="cursor-pointer flex list-none items-center justify-between px-4 py-3 hover:bg-white/[0.02]">
        <h2 className="h-panel">Market depth</h2>
        <span className="text-xs text-muted">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <p className="px-4 pb-2 text-xs text-muted">
        How many units it takes to move the price each step, derived from the simulated price pool.
      </p>
      <table className="w-full overflow-hidden">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th className="py-1 pl-3 font-medium">Price</th>
            <th className="py-1 text-right font-medium">Size</th>
            <th className="py-1 pr-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {asks.map((r, i) => <Row key={`a${i}`} r={r} side="ask" />)}
          <tr>
            <td colSpan={3} className="num border-y border-line bg-white/[0.02] px-3 py-1.5 text-sm font-semibold">
              {usd(p0)} <span className="text-xs font-normal text-muted">current price</span>
            </td>
          </tr>
          {bids.map((r, i) => <Row key={`b${i}`} r={r} side="bid" />)}
        </tbody>
      </table>
      <div className="h-2" />
    </details>
  );
}
