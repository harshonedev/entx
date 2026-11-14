"use client";

import { useState } from "react";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import type { PredictionSeed } from "@/lib/predictions";
import { FEE, quoteBinary, yesPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";
import { num, usd } from "@/lib/format";
import { useReceipts } from "@/lib/receipts";
import { Flash } from "./ui";

const PRESETS = [10, 25, 50, 100];

const cents = (p: number) => `${(p * 100).toFixed(p < 0.1 || p > 0.9 ? 1 : 0)}¢`;

export function PredictionTicket({ p }: { p: PredictionSeed }) {
  const st = useMarket((s) => s.predictions[p.id]);
  const cash = useMarket((s) => s.cash);
  const predict = useMarket((s) => s.predict);
  const receipts = useReceipts();
  const connected = receipts.any;
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amountText, setAmountText] = useState("25");

  const yp = yesPrice(st.pool);
  const price = side === "YES" ? yp : 1 - yp;
  const amount = Math.max(0, Number(amountText) || 0);
  const q = quoteBinary(st.pool, side, amount);
  const after = yesPrice(q.after);
  const profit = q.shares - amount;
  const maxBet = Math.floor(cash);

  const reason =
    amount <= 0 ? "Enter an amount" : amount > cash + 1e-9 ? `Not enough cash · need ${usd(amount - cash)} more` : null;

  const place = () => {
    const t = predict(p.id, side, amount);
    if (!t) return;
    if (connected) void receipts.record(t);
    const left = Math.floor(useMarket.getState().cash);
    if (amount > left) setAmountText(String(left));
  };

  if (st.resolved) {
    return (
      <div className="panel p-4">
        <div className="label">Outcome</div>
        <div className={clsx("mt-1 text-2xl font-semibold", st.resolved === "YES" ? "text-up" : "text-down")}>
          Settled {st.resolved}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Betting is closed. Winning {st.resolved} shares paid $1.00 each; {st.resolved === "YES" ? "NO" : "YES"} shares
          paid nothing.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Outcome">
        {(["YES", "NO"] as const).map((s) => {
          const px = s === "YES" ? yp : 1 - yp;
          const on = side === s;
          return (
            <button
              key={s}
              onClick={() => setSide(s)}
              aria-pressed={on}
              aria-label={`${s === "YES" ? "Yes" : "No"} at ${(px * 100).toFixed(0)} cents`}
              className={clsx(
                "cursor-pointer flex h-12 items-center justify-center gap-2 rounded text-[13.5px] font-semibold transition-colors",
                on
                  ? s === "YES"
                    ? "bg-up text-black"
                    : "bg-down text-black"
                  : s === "YES"
                    ? "bg-up/[0.08] text-up hover:bg-up/[0.14]"
                    : "bg-down/[0.08] text-down hover:bg-down/[0.14]",
              )}
            >
              {s === "YES" ? "Yes" : "No"}
              <span className="num font-normal opacity-80">
                <Flash value={px}>{cents(px)}</Flash>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
        <label htmlFor="bet-amount">Amount</label>
        <button className="cursor-pointer hover:text-text" onClick={() => setAmountText(String(maxBet))}>
          Max: <span className="num">{usd(maxBet, 0)}</span>
        </button>
      </div>
      <div className="mt-1.5 flex items-center rounded bg-panel-2 px-4 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-accent">
        <span className="num mr-1 text-[26px] font-medium text-muted">$</span>
        <input
          id="bet-amount"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.]/g, ""))}
          className="num h-14 w-full bg-transparent text-[26px] font-medium tracking-[-0.02em] outline-none"
        />
        <span className="shrink-0 text-sm text-muted">
          on <span className={clsx("font-semibold", side === "YES" ? "text-up" : "text-down")}>{side}</span>
        </span>
      </div>
      <div className="seg mt-2 grid w-full grid-cols-4">
        {PRESETS.map((a) => (
          <button
            key={a}
            onClick={() => setAmountText(String(a))}
            aria-pressed={amountText === String(a)}
            className="cursor-pointer num"
          >
            ${a}
          </button>
        ))}
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <Row k={`${side} price now`} v={cents(price)} />
        <Row k="Avg price per share" v={amount > 0 ? cents(q.avg) : "—"} />
        <Row k="Shares" v={amount > 0 ? num(q.shares, 1) : "—"} />
        <Row
          k="Chance of YES after"
          v={amount > 0 ? `${(yp * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}%` : "—"}
          tone={Math.abs(after - yp) > 0.02 ? "warn" : undefined}
        />
        <Row k={`Fee (${(FEE * 100).toFixed(1)}%)`} v={amount > 0 ? usd(amount * FEE) : "—"} />
        <div className="my-2 border-t border-line" />
        <Row k={`Payout if ${side}`} v={amount > 0 ? usd(q.shares) : "—"} strong />
        <Row
          k="Profit if right"
          v={amount > 0 ? `+${usd(profit)} (${Math.round((profit / amount) * 100)}%)` : "—"}
          tone={amount > 0 ? "up" : undefined}
        />
      </dl>

      <button
        disabled={reason !== null}
        onClick={place}
        className={clsx(
          "cursor-pointer mt-4 h-12 w-full rounded text-[13.5px] font-semibold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40",
          side === "YES" ? "bg-up" : "bg-down",
        )}
      >
        {reason ?? `Bet ${usd(amount, amount % 1 ? 2 : 0)} on ${side === "YES" ? "Yes" : "No"}`}
      </button>

      <div className="mt-4 flex items-center justify-between rounded bg-panel-2 p-3 text-xs">
        <span className="text-faint">Available</span>
        <Flash value={cash} className="num font-semibold">
          {usd(cash)}
        </Flash>
      </div>

      <div className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        <ShieldCheck size={14} className={clsx("mt-0.5 shrink-0", connected ? "text-sol" : "text-faint")} />
        {connected
          ? "Each bet's receipt will be signed on-chain. Odds and payouts in this ticket remain simulated."
          : "Odds and payouts here are simulated. To put real testnet NEAR on this outcome, use the NEAR pool below."}
      </div>
    </div>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "warn" | "up" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd
        className={clsx(
          "num text-right",
          strong && "text-sm font-semibold",
          tone === "warn" && "text-warn",
          tone === "up" && "text-up",
        )}
      >
        {v}
      </dd>
    </div>
  );
}
