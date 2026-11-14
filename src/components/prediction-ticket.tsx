"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ShieldCheck } from "lucide-react";
import type { PredictionSeed } from "@/lib/predictions";
import { FEE, quoteBinary, yesPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";
import { cents, num, usd } from "@/lib/format";
import { useReceipts } from "@/lib/receipts";
import { Flash } from "./ui";
import { FillReceipt } from "./fill-receipt";

const PRESETS = [10, 25, 50, 100];
/** How long the button shows "Filled" before it is a button again. The receipt below stays. */
const FILLED_MS = 2500;

/** Fired by the mobile bet bar so its Yes/No buttons land on the ticket with that side picked. */
export const PICK_SIDE_EVENT = "entx:pick-side";

export function PredictionTicket({ p }: { p: PredictionSeed }) {
  const st = useMarket((s) => s.predictions[p.id]);
  const cash = useMarket((s) => s.cash);
  const predict = useMarket((s) => s.predict);
  const receipts = useReceipts();
  const connected = receipts.any;
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amountText, setAmountText] = useState("25");
  const [fillId, setFillId] = useState<string | null>(null);
  const [quoted, setQuoted] = useState(0);
  const clearFill = useCallback(() => setFillId(null), []);
  const input = useRef<HTMLInputElement>(null);
  // For a moment after a bet, the button itself confirms it; changing side or amount ends that early.
  const [filled, setFilled] = useState<{ label: string; key: string } | null>(null);
  useEffect(() => {
    if (!filled) return;
    const t = setTimeout(() => setFilled(null), FILLED_MS);
    return () => clearTimeout(t);
  }, [filled]);
  // Shares already held on the other side of this market: a bet here offsets them.
  const opposite = useMarket((s) => {
    const other = side === "YES" ? "NO" : "YES";
    return s.positions.find((x) => x.marketId === p.id && x.side === other)?.shares ?? 0;
  });

  useEffect(() => {
    const pick = (e: Event) => {
      const s = (e as CustomEvent<unknown>).detail;
      if (s !== "YES" && s !== "NO") return;
      setSide(s);
      input.current?.focus({ preventScroll: true });
    };
    window.addEventListener(PICK_SIDE_EVENT, pick);
    return () => window.removeEventListener(PICK_SIDE_EVENT, pick);
  }, []);

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
    // Fill at the live odds, but refuse if they slipped more than 1% from the payout on screen.
    const t = predict(p.id, side, amount, q.shares * 0.99);
    if (!t) return;
    setFillId(t.id);
    setQuoted(q.shares);
    if (connected) void receipts.record(t);
    const left = Math.floor(useMarket.getState().cash);
    const next = amount > left ? String(left) : amountText;
    if (next !== amountText) setAmountText(next);
    setFilled({ label: `Filled · ${num(t.qty, 1)} ${side} shares · ${usd(t.total)}`, key: `${side}:${next}` });
  };
  const justFilled = filled && filled.key === `${side}:${amountText}` ? filled.label : null;

  if (st.resolved) {
    return (
      <div className="panel ticket p-4">
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
    <div className="panel ticket p-4">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Outcome">
        {(["YES", "NO"] as const).map((s) => {
          const px = s === "YES" ? yp : 1 - yp;
          const on = side === s;
          return (
            <button
              key={s}
              onClick={() => setSide(s)}
              aria-pressed={on}
              aria-label={`${s === "YES" ? "Yes" : "No"} at ${(px * 100).toFixed(1)} cents`}
              className={clsx(
                "cond cursor-pointer flex h-12 items-center justify-center gap-2 border text-[18px] font-bold uppercase tracking-[0.06em] transition-colors",
                on
                  ? s === "YES"
                    ? "border-up bg-up text-white"
                    : "border-down bg-down text-white"
                  : s === "YES"
                    ? "border-up text-up hover:bg-up/[0.08]"
                    : "border-down text-down hover:bg-down/[0.08]",
              )}
            >
              {s === "YES" ? "Yes" : "No"}
              <span className="num font-semibold opacity-90">
                <Flash value={px}>{cents(px)}</Flash>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
        <label htmlFor="bet-amount">Amount</label>
        <button className="cursor-pointer inline-flex items-center gap-1 hover:text-text pointer-coarse:min-h-11" onClick={() => setAmountText(String(maxBet))}>
          All your cash: <span className="num">{usd(maxBet, 0)}</span>
        </button>
      </div>
      <div className="mt-1.5 flex items-center rounded bg-panel-2 px-4 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-accent">
        <span className="num mr-1 text-[26px] font-medium text-muted">$</span>
        <input
          ref={input}
          id="bet-amount"
          name="bet-amount"
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

      <dl className="kv-dotted mt-4 text-xs">
        <Row k={`${side} price now = chance of ${side}`} v={cents(price)} />
        <Row k="Avg price per share" v={amount > 0 ? cents(q.avg) : "—"} />
        <Row k="Shares" v={amount > 0 ? num(q.shares, 1) : "—"} />
        <Row
          k="Chance of YES after"
          v={
            amount <= 0
              ? "—"
              : Math.abs(after - yp) < 0.001
                ? `${(yp * 100).toFixed(1)}% (barely moves)`
                : `${(yp * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}%`
          }
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
      {amount > 0 && price < 0.1 && (
        <p className="mt-2 text-xs leading-relaxed text-warn">
          Long shot: the market gives {side} about a {Math.max(1, Math.round(price * 100))}% chance, so most bets at
          this price lose the full stake.
        </p>
      )}

      {opposite > 0.05 && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          You hold <span className="num text-text">{num(opposite, 1)}</span> {side === "YES" ? "NO" : "YES"} shares;
          betting {side} hedges that position.
        </p>
      )}

      {justFilled ? (
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
          disabled={reason !== null}
          onClick={place}
          className={clsx(
            "btn-primary cursor-pointer mt-4 h-12 w-full text-[18px] disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {reason ?? `Bet ${usd(amount, amount % 1 ? 2 : 0)} on ${side === "YES" ? "Yes" : "No"}`}
        </button>
      )}

      {fillId && <FillReceipt tradeId={fillId} quoted={quoted} onDone={clearFill} />}

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
          : "Odds and payouts here are simulated. To stake testnet NEAR on this outcome on-chain, use the NEAR pool below."}
      </div>
    </div>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "warn" | "up" }) {
  return (
    <div>
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
