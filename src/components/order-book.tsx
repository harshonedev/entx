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
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-[11px]">
      <div
        className={side === "ask" ? "absolute inset-y-0 right-0 bg-down/10" : "absolute inset-y-0 right-0 bg-up/10"}
        style={{ width: `${(r.cum / max) * 100}%` }}
      />
      <span className={`num relative ${side === "ask" ? "text-down" : "text-up"}`}>{num(r.price)}</span>
      <span className="num relative text-right text-muted">{num(r.size, 0)}</span>
      <span className="num relative text-right text-faint">{num(r.cum, 0)}</span>
    </div>
  );

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="h-panel">Market depth</span>
        <span className="text-[11px] text-faint">AMM-derived · simulated</span>
      </div>
      <div className="grid grid-cols-3 px-3 py-1 text-[11px] uppercase tracking-wider text-faint">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      {asks.map((r, i) => <Row key={`a${i}`} r={r} side="ask" />)}
      <div className="num border-y border-line bg-white/[0.02] px-3 py-1.5 text-sm font-semibold">{usd(p0)}</div>
      {bids.map((r, i) => <Row key={`b${i}`} r={r} side="bid" />)}
      <div className="h-2" />
    </div>
  );
}
