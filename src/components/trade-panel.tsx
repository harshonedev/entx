"use client";

import { CHAIN_ON, MULTICHAIN } from "@/lib/env";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ShieldCheck } from "lucide-react";
import type { AssetSeed } from "@/lib/assets";
import { quoteBuy, quoteSell, unitsForDollars, FEE } from "@/lib/engine";
import { priceOf, useMarket } from "@/store/market";
import { num, pct, usd } from "@/lib/format";
import { useReceipts } from "@/lib/receipts";
import { Flash } from "./ui";
import { FillReceipt } from "./fill-receipt";

const PRESETS = { units: [1, 5, 10, 25], usd: [10, 25, 50, 100] } as const;
/** How long the button shows "Filled" before it is a button again. The receipt below stays. */
const FILLED_MS = 2500;

export function TradePanel({ asset }: { asset: AssetSeed }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qtyText, setQtyText] = useState("25");
  // Fans think in dollars ("$25 of The Odyssey"); traders think in units. Both enter the same order.
  const [mode, setMode] = useState<"units" | "usd">("usd");
  const m = useMarket((s) => s.markets[asset.id]);
  const cash = useMarket((s) => s.cash);
  const held = useMarket((s) => s.holdings[asset.id]);
  const buy = useMarket((s) => s.buy);
  const sell = useMarket((s) => s.sell);
  const receipts = useReceipts();
  const connected = receipts.any;
  // Confirm is tied to the exact order; changing side or quantity drops it.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  // When the confirm appeared; clicks inside the next 400ms are the tail of a double-click, not a decision.
  const [confirmAt, setConfirmAt] = useState(0);
  // Figures shown in the review are frozen when it opens, so they don't drift while being read.
  const [snap, setSnap] = useState({ total: 0, share: 0 });
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const [fillId, setFillId] = useState<string | null>(null);
  const [quotedQty, setQuotedQty] = useState(0);
  const clearFill = useCallback(() => setFillId(null), []);
  // For a moment after a fill, the button itself says what happened, right where the click landed.
  // Tied to the cleared ticket: picking a new amount or side ends it early.
  const [filled, setFilled] = useState<{ label: string; key: string } | null>(null);
  useEffect(() => {
    if (!filled) return;
    const t = setTimeout(() => setFilled(null), FILLED_MS);
    return () => clearTimeout(t);
  }, [filled]);

  const entered = Math.max(0, Number(qtyText) || 0);
  const price = priceOf(m);
  const units = held?.units ?? 0;
  // Dollar-mode orders keep the exact unit fraction, so "$25" spends $25.00, not $24.91.
  const qty = mode === "units" ? entered : unitsForDollars(m.pool, entered, side);
  const bq = quoteBuy(m.pool, qty);
  const sq = quoteSell(m.pool, Math.min(qty, units));
  const total = side === "buy" ? bq.cost : sq.proceeds;
  const avg = side === "buy" ? bq.avg : sq.avg;
  const impact = side === "buy" ? bq.impact : sq.impact;
  // Max is exact for both modes: dollar orders spend precisely what is entered, fee included.
  const maxBuy = Math.floor(unitsForDollars(m.pool, cash, "buy"));
  const maxUsd = Math.floor(cash);
  /** Buys above 10% of cash get a second, explicit confirm. */
  const share = cash > 0 ? total / cash : 0;
  const needsReview = side === "buy" && share > 0.1;
  const orderKey = `${side}:${mode}:${qtyText}`;
  const confirming = confirmFor === orderKey;
  const justFilled = filled && filled.key === `${side}:${mode}:` && qtyText === "" ? filled.label : null;
  const setConfirming = (on: boolean, at = 0) => {
    setConfirmFor(on ? orderKey : null);
    if (on) {
      setConfirmAt(at);
      setSnap({ total, share });
    }
  };

  useEffect(() => {
    if (confirming) confirmBtn.current?.focus();
  }, [confirming]);

  const invalid =
    qty <= 0 || (side === "buy" ? bq.cost > cash : qty > units + 1e-9);
  const reason =
    qty <= 0
      ? "Enter a quantity"
      : side === "buy" && bq.cost > cash
        ? `Not enough cash · need ${usd(bq.cost - cash)} more`
        : side === "sell" && qty > units
          ? `You hold ${num(units, 0)} units`
          : null;

  const execute = () => {
    setConfirming(false);
    // Re-quote dollar orders against the pool as it is now, so the amount entered is the amount spent.
    const live = useMarket.getState().markets[asset.id].pool;
    const fillQty = mode === "usd" ? unitsForDollars(live, entered, side) : qty;
    if (!Number.isFinite(fillQty) || fillQty <= 0) return;
    const t = side === "buy" ? buy(asset.id, fillQty) : sell(asset.id, Math.min(fillQty, units));
    if (!t) return;
    setFillId(t.id);
    setQuotedQty(qty);
    setFilled({ label: `Filled · ${num(t.qty, t.qty % 1 ? 2 : 0)} ${asset.ticker} · ${usd(t.total)}`, key: `${side}:${mode}:` });
    if (connected) void receipts.record(t);
    // A finished order clears the ticket, so the next tap can't repeat it by accident. Focus goes back to
    // the amount for the next order, except on touch screens where it would pop the keyboard open.
    setQtyText("");
    const fine = typeof window !== "undefined" && !window.matchMedia?.("(pointer: coarse)").matches;
    if (fine) amountInput.current?.focus({ preventScroll: true });
  };

  const submit = (e: React.MouseEvent) => {
    if (needsReview) setConfirming(true, e.timeStamp);
    else execute();
  };

  const confirm = (e: React.MouseEvent) => {
    if (e.timeStamp - confirmAt < 400) return;
    execute();
  };

  return (
    <div className="panel p-4">
      <div className="grid grid-cols-2 gap-1.5">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            aria-pressed={side === s}
            className={clsx(
              "cursor-pointer h-11 rounded text-[13px] font-medium transition-colors",
              side === s
                ? s === "buy"
                  ? "bg-up/[0.12] text-up"
                  : "bg-down/[0.12] text-down"
                : "bg-panel-2 text-muted hover:text-text",
            )}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
        <div className="seg" role="group" aria-label="Enter amount in">
          {(
            [
              ["usd", "Dollars"],
              ["units", "Units"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              aria-pressed={mode === k}
              className="cursor-pointer"
              onClick={() => {
                if (k === mode) return;
                // Carry the order across: convert the current amount into the other unit.
                setQtyText(k === "usd" ? String(Math.round(total)) : String(Number.isFinite(qty) ? Math.floor(qty) : 0));
                setMode(k);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          className="cursor-pointer inline-flex items-center gap-1 hover:text-text pointer-coarse:min-h-11"
          onClick={() =>
            setQtyText(
              mode === "units"
                ? String(side === "buy" ? maxBuy : Math.floor(units))
                : String(Math.floor(side === "buy" ? maxUsd : quoteSell(m.pool, units).proceeds)),
            )
          }
        >
          {side === "buy" ? "All your cash:" : "All you hold:"}{" "}
          <span className="num">
            {mode === "units"
              ? side === "buy"
                ? maxBuy
                : num(units, 0)
              : usd(side === "buy" ? maxUsd : quoteSell(m.pool, units).proceeds, 0)}
          </span>
        </button>
      </div>
      <div className="mt-1.5 flex items-center rounded bg-panel-2 px-4 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-accent">
        {mode === "usd" && <span className="num mr-1 text-[26px] font-medium text-muted">$</span>}
        <input
          ref={amountInput}
          name="trade-amount"
          inputMode="decimal"
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value.replace(/[^0-9.]/g, ""))}
          className="num h-14 w-full bg-transparent text-[26px] font-medium tracking-[-0.02em] outline-none"
          aria-label={mode === "usd" ? `Dollars of ${asset.title}` : `Units of ${asset.title}`}
          aria-describedby="unit-hint"
        />
        <span className="shrink-0 text-right text-sm text-muted">
          {mode === "usd" ? (
            <>
              <span className="num">≈ {Number.isFinite(qty) && qty > 0 ? num(qty, 2) : "—"}</span> units
            </>
          ) : (
            <span className="font-semibold">{asset.ticker}</span>
          )}
        </span>
      </div>
      <div className="seg mt-2 grid w-full grid-cols-4">
        {PRESETS[mode].map((p) => (
          <button
            key={p}
            onClick={() => setQtyText(String(p))}
            aria-pressed={qtyText === String(p)}
            className="cursor-pointer num"
          >
            {mode === "usd" ? `$${p}` : p}
          </button>
        ))}
      </div>
      <p id="unit-hint" className="mt-2 text-xs leading-relaxed text-muted">
        1 {asset.ticker} unit tracks {asset.title}&apos;s popularity-driven price. It isn&apos;t a share of the film
        or its revenue.
      </p>

      <dl className="mt-4 space-y-1.5 text-xs">
        <Row k="Market price" v={usd(price)} />
        <Row k="Avg price per unit (incl. fee)" v={qty > 0 ? usd(avg) : "—"} />
        <Row
          k="Price impact"
          hint="How much this order moves the price"
          v={qty > 0 ? pct(impact) : "—"}
          tone={!invalid && Math.abs(impact) > 0.01 ? "warn" : undefined}
        />
        <Row k={`Fee (${(FEE * 100).toFixed(1)}%)`} v={qty > 0 ? usd(total * FEE) : "—"} />
        <div className="my-2 border-t border-line" />
        <Row k={side === "buy" ? "Total cost" : "You receive"} v={usd(total)} strong />
      </dl>

      {confirming && !invalid ? (
        <div
          className="mt-4 rounded border border-line-2 p-3"
          role="group"
          aria-labelledby="review-h"
          onKeyDown={(e) => {
            // Escape backs out of the review, like closing a dialog; focus returns to the ticket's amount.
            if (e.key !== "Escape") return;
            e.preventDefault();
            setConfirming(false);
            amountInput.current?.focus();
          }}
        >
          <div id="review-h" className="text-[13px] font-semibold" role="status">
            Review large order
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {num(qty, qty % 1 ? 2 : 0)} units of {asset.title} for{" "}
            about <span className="num font-semibold text-text">{usd(snap.total)}</span>. That&apos;s{" "}
            <span className="num text-text">{Math.round(snap.share * 100)}%</span> of your cash. The final price can
            move slightly before you confirm.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirming(false)}
              aria-keyshortcuts="Escape"
              className="cursor-pointer h-11 rounded bg-panel-2 text-[13px] font-medium hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              ref={confirmBtn}
              onClick={confirm}
              className="cursor-pointer h-11 rounded bg-up text-[13px] font-semibold text-black hover:brightness-110"
            >
              Confirm buy
            </button>
          </div>
        </div>
      ) : justFilled ? (
        <button
          disabled
          data-static
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded bg-up/[0.12] text-[13.5px] font-semibold text-up"
        >
          <Check size={15} aria-hidden />
          <span className="num">{justFilled}</span>
        </button>
      ) : (
        <button
          disabled={invalid}
          onClick={submit}
          className={clsx(
            "cursor-pointer mt-4 h-12 w-full rounded text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:bg-panel-2 disabled:font-medium disabled:text-muted",
            side === "buy" ? "bg-up text-black hover:brightness-110" : "bg-down text-black hover:brightness-110",
          )}
        >
          {reason ?? `${side === "buy" ? "Buy" : "Sell"} ${num(qty, qty % 1 ? 2 : 0)} ${asset.ticker} · ${usd(total)}`}
        </button>
      )}
      {fillId && <FillReceipt tradeId={fillId} unit={asset.ticker} quoted={quotedQty} onDone={clearFill} />}
      {!justFilled && invalid && side === "buy" && qty > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          {maxBuy > 0 ? (
            <button
              className="cursor-pointer text-text underline underline-offset-2"
              onClick={() =>
                setQtyText(mode === "units" ? String(maxBuy) : String(maxUsd))
              }
            >
              Your cash covers {mode === "units" ? `${maxBuy} units` : usd(maxUsd, 0)} · use that
            </button>
          ) : (
            <span>Not enough cash for one unit.</span>
          )}
          {units > 0 && (
            <button className="cursor-pointer text-text underline underline-offset-2" onClick={() => setSide("sell")}>
              You hold {num(units, units % 1 ? 2 : 0)} {asset.ticker} · Sell?
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 rounded bg-panel-2 p-3 text-xs">
        <div>
          <div className="text-faint">Available</div>
          <Flash value={cash} className="num mt-0.5 block font-semibold">{usd(cash)}</Flash>
        </div>
        <div>
          <div className="text-faint">Holding</div>
          <Flash value={units} className="num mt-0.5 block font-semibold">
            {num(units, units % 1 ? 2 : 0)} {asset.ticker}
          </Flash>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        <ShieldCheck size={14} className={clsx("mt-0.5 shrink-0", connected ? "text-sol" : "text-faint")} />
        {receipts.any
          ? `Each trade's receipt will be signed and written to ${[receipts.active.solana && "Solana devnet (Memo)", receipts.active.near && "NEAR testnet (record_trade, 0.01 Ⓝ storage deposit, excess refunded)"].filter(Boolean).join(" + ")}. Prices remain simulated.`
          : MULTICHAIN
            ? "Optional: connect a Solana or NEAR wallet to sign an on-chain receipt for each trade. NEAR receipts hold a 0.01 Ⓝ storage deposit; the unused part is refunded."
            : CHAIN_ON.near
            ? "Optional: connect a NEAR wallet to sign an on-chain receipt for each trade. Each receipt holds a 0.01 Ⓝ storage deposit; the unused part is refunded."
            : "Optional: connect a Solana wallet to sign a devnet memo receipt for each trade."}
      </div>
    </div>
  );
}

function Row({ k, v, hint, strong, tone }: { k: string; v: string; hint?: string; strong?: boolean; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">
        {k}
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </dt>
      <dd className={clsx("num", strong && "text-sm font-semibold", tone === "warn" && "text-warn")}>{v}</dd>
    </div>
  );
}
