"use client";

import { useState } from "react";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import type { AssetSeed } from "@/lib/assets";
import { quoteBuy, quoteSell, FEE } from "@/lib/engine";
import { priceOf, useMarket } from "@/store/market";
import { num, pct, usd } from "@/lib/format";
import { useReceipts } from "@/lib/receipts";

const PRESETS = [1, 5, 10, 25];

export function TradePanel({ asset }: { asset: AssetSeed }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qtyText, setQtyText] = useState("10");
  const m = useMarket((s) => s.markets[asset.id]);
  const cash = useMarket((s) => s.cash);
  const held = useMarket((s) => s.holdings[asset.id]);
  const buy = useMarket((s) => s.buy);
  const sell = useMarket((s) => s.sell);
  const receipts = useReceipts();
  const connected = receipts.any;

  const qty = Math.max(0, Number(qtyText) || 0);
  const price = priceOf(m);
  const units = held?.units ?? 0;
  const bq = quoteBuy(m.pool, qty);
  const sq = quoteSell(m.pool, Math.min(qty, units));
  const total = side === "buy" ? bq.cost : sq.proceeds;
  const avg = side === "buy" ? bq.avg : sq.avg;
  const impact = side === "buy" ? bq.impact : sq.impact;
  const maxBuy = Math.floor((cash / price) * 0.98);

  const invalid =
    qty <= 0 || (side === "buy" ? bq.cost > cash : qty > units + 1e-9);
  const reason =
    qty <= 0
      ? "Enter a quantity"
      : side === "buy" && bq.cost > cash
        ? "Insufficient balance"
        : side === "sell" && qty > units
          ? `You hold ${num(units, 0)} units`
          : null;

  const submit = () => {
    const t = side === "buy" ? buy(asset.id, qty) : sell(asset.id, qty);
    if (t && connected) void receipts.record(t);
  };

  return (
    <div className="panel p-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.03] p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={clsx(
              "rounded-lg py-2 text-sm font-semibold capitalize transition-colors",
              side === s
                ? s === "buy"
                  ? "bg-up text-black"
                  : "bg-down text-black"
                : "text-muted hover:text-text",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>Quantity (units)</span>
        <button
          className="hover:text-text"
          onClick={() => setQtyText(String(side === "buy" ? maxBuy : Math.floor(units)))}
        >
          Max: <span className="num">{side === "buy" ? maxBuy : num(units, 0)}</span>
        </button>
      </div>
      <div className="mt-1.5 flex items-center rounded-xl border border-line-2 bg-bg px-3 focus-within:border-accent/60">
        <input
          inputMode="decimal"
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value.replace(/[^0-9.]/g, ""))}
          className="num h-11 w-full bg-transparent text-lg font-semibold outline-none"
          aria-label="Quantity"
        />
        <span className="text-sm font-semibold text-muted">{asset.ticker}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setQtyText(String(p))}
            className="num rounded-lg border border-line py-1.5 text-xs text-muted hover:border-line-2 hover:text-text"
          >
            {p}
          </button>
        ))}
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <Row k="Market price" v={usd(price)} />
        <Row k="Avg fill" v={qty > 0 ? usd(avg) : "—"} />
        <Row
          k="Price impact"
          v={qty > 0 ? pct(impact) : "—"}
          tone={Math.abs(impact) > 0.01 ? "warn" : undefined}
        />
        <Row k={`Fee (${(FEE * 100).toFixed(1)}%)`} v={qty > 0 ? usd(total * FEE) : "—"} />
        <div className="my-2 border-t border-line" />
        <Row k={side === "buy" ? "Total cost" : "You receive"} v={usd(total)} strong />
      </dl>

      <button
        disabled={invalid}
        onClick={submit}
        className={clsx(
          "mt-4 w-full rounded-xl py-3 text-sm font-bold transition-[filter,transform] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40",
          side === "buy" ? "bg-up text-black hover:brightness-110" : "bg-down text-black hover:brightness-110",
        )}
      >
        {reason ?? `${side === "buy" ? "Buy" : "Sell"} ${num(qty, qty % 1 ? 2 : 0)} ${asset.ticker} · ${usd(total)}`}
      </button>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-white/[0.025] p-3 text-xs">
        <div>
          <div className="text-faint">Available</div>
          <div className="num mt-0.5 font-semibold">{usd(cash)}</div>
        </div>
        <div>
          <div className="text-faint">Holding</div>
          <div className="num mt-0.5 font-semibold">
            {num(units, units % 1 ? 2 : 0)} {asset.ticker}
          </div>
        </div>
      </div>

      <div
        className={clsx(
          "mt-3 flex items-start gap-2 rounded-xl border p-2.5 text-[11px] leading-relaxed",
          connected ? "border-sol/30 bg-sol/[0.06] text-text/80" : "border-line text-muted",
        )}
      >
        <ShieldCheck size={14} className={clsx("mt-0.5 shrink-0", connected ? "text-sol" : "text-faint")} />
        {connected
          ? `Each trade's receipt will be signed and written to ${[receipts.active.solana && "Solana devnet (Memo)", receipts.active.near && "NEAR testnet (record_trade)"].filter(Boolean).join(" + ")}. Prices remain simulated.`
          : "Connect a Solana and/or NEAR wallet to write a verifiable receipt of each trade on-chain. Trading works without it."}
      </div>
    </div>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className={clsx("num", strong && "text-sm font-semibold", tone === "warn" && "text-accent")}>{v}</dd>
    </div>
  );
}
