"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import clsx from "clsx";
import { FillReceipt } from "./fill-receipt";
import { Clock, Gavel, X } from "lucide-react";
import { ASSET_BY_ID } from "@/lib/assets";
import type { PredictionSeed } from "@/lib/predictions";
import { quoteBinary, yesPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";
import { cents, compactUsd, num, usd } from "@/lib/format";
import { useReceipts } from "@/lib/receipts";
import { Poster } from "./poster";
import { Flash } from "./ui";
import { NearStakePanel } from "./near-stake";
import { CHAIN } from "@/lib/env";

const AMOUNTS = [10, 25, 50, 100];

export function PredictionCard({ p, compact = false }: { p: PredictionSeed; compact?: boolean }) {
  const st = useMarket((s) => s.predictions[p.id]);
  const positions = useMarket((s) => s.positions);
  const cash = useMarket((s) => s.cash);
  const predict = useMarket((s) => s.predict);
  const receipts = useReceipts();
  const [side, setSide] = useState<"YES" | "NO" | null>(null);
  const [amount, setAmount] = useState(25);
  // Real-NEAR staking is a second path, mounted only on request so 9 cards don't each poll RPC.
  const [staking, setStaking] = useState(false);
  const [rules, setRules] = useState(false);
  const [fillId, setFillId] = useState<string | null>(null);
  const [quoted, setQuoted] = useState(0);
  const clearFill = useCallback(() => setFillId(null), []);

  const yp = yesPrice(st.pool);
  const asset = p.assetId ? ASSET_BY_ID[p.assetId] : undefined;
  const mine = positions.filter((x) => x.marketId === p.id);
  const q = side ? quoteBinary(st.pool, side, amount) : null;

  // Bets above 10% of cash get the same second step as large trades; the confirm is tied to
  // side + amount and ignores the tail of a double-click.
  const [review, setReview] = useState<{ key: string; at: number } | null>(null);
  const betKey = `${side}:${amount}`;
  const reviewing = review?.key === betKey;
  const needsReview = cash > 0 && amount / cash > 0.1;

  const card = useRef<HTMLDivElement>(null);
  const sideBtns = useRef<HTMLDivElement>(null);
  /** Closes the ticket; `refocus` hands focus back to the side button that opened it. */
  const closeTicket = useCallback(
    (refocus: boolean) => {
      const btn = side ? sideBtns.current?.querySelector<HTMLButtonElement>(`[data-side="${side}"]`) : null;
      setSide(null);
      setReview(null);
      if (refocus) btn?.focus();
    },
    [side],
  );
  // Escape steps back one level: out of the large-bet review first, then closes the ticket.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || st.resolved) return;
    if (reviewing) {
      e.stopPropagation();
      setReview(null);
    } else if (side) {
      e.stopPropagation();
      closeTicket(true);
    }
  };

  const place = (e: React.MouseEvent) => {
    if (!side) return;
    if (needsReview && !reviewing) {
      setReview({ key: betKey, at: e.timeStamp });
      return;
    }
    if (reviewing && e.timeStamp - review.at < 400) return;
    setReview(null);
    const t = predict(p.id, side, amount, q ? q.shares * 0.99 : undefined);
    if (t) {
      closeTicket(true);
      setFillId(t.id);
      setQuoted(q ? q.shares : 0);
      if (receipts.any) void receipts.record(t);
    }
  };

  return (
    <div ref={card} className="panel flex flex-col p-4" onKeyDown={onKeyDown}>
      <div className="flex items-start gap-3">
        {asset && !compact && (
          <Link className="cursor-pointer" href={`/asset/${asset.id}`} aria-label={`${asset.title} (${asset.ticker})`}>
            <Poster asset={asset} size="sm" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/predictions/${p.id}`}
            className="cursor-pointer block text-[15px] font-semibold leading-snug hover:text-accent"
          >
            {p.question}
          </Link>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className="border border-line-2 px-1.5 font-medium text-text">{p.category}</span>
            {asset && <span className="font-semibold">{asset.ticker}</span>}
            <span className="ml-auto inline-flex items-center gap-1">
              <Clock size={11} /> {st.resolved ? "Closed" : `${p.closesInDays}d left`}
            </span>
          </div>
        </div>
      </div>

      {/* Probability bar */}
      <div className="mt-4">
        <div className="flex items-end justify-between">
          <div className="num text-2xl font-semibold">
            <Flash value={yp}>{st.resolved ? st.resolved : `${(yp * 100).toFixed(0)}%`}</Flash>
            {!st.resolved && <span className="ml-1.5 text-xs font-normal text-muted">chance YES</span>}
          </div>
          <div className="text-xs text-muted">{compactUsd(st.volume)} traded</div>
        </div>
        <div className="mt-2 flex h-1 overflow-hidden bg-down/40">
          <div className="h-full w-full origin-left bg-up motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out" style={{ transform: `scaleX(${yp})` }} />
        </div>
      </div>

      {st.resolved ? (
        <div
          className={clsx(
            "mt-4 rounded border p-3 text-center text-sm font-semibold",
            st.resolved === "YES" ? "border-up/30 text-up" : "border-down/30 text-down",
          )}
        >
          Settled {st.resolved}
        </div>
      ) : (
        <>
          {/* The ticket floats over the grid (popover on md+, bottom sheet on phones), so the card keeps its height. */}
          <div className="relative mt-4">
          <div ref={sideBtns} className="grid grid-cols-2 gap-2">
            <button
              data-side="YES"
              onClick={() => setSide(side === "YES" ? null : "YES")}
              aria-pressed={side === "YES"}
              aria-label={`Pick YES at ${(yp * 100).toFixed(1)} cents`}
              className={clsx(
                "cursor-pointer min-h-11 rounded border py-2.5 text-sm font-semibold transition-colors",
                side === "YES" ? "border-up bg-up text-on-status" : "border-transparent bg-up/[0.08] text-up hover:bg-up/[0.14]",
              )}
            >
              Yes <span className="num font-normal">{cents(yp)}</span>
            </button>
            <button
              data-side="NO"
              onClick={() => setSide(side === "NO" ? null : "NO")}
              aria-pressed={side === "NO"}
              aria-label={`Pick NO at ${((1 - yp) * 100).toFixed(1)} cents`}
              className={clsx(
                "cursor-pointer min-h-11 rounded border py-2.5 text-sm font-semibold transition-colors",
                side === "NO" ? "border-down bg-down text-on-status" : "border-transparent bg-down/[0.08] text-down hover:bg-down/[0.14]",
              )}
            >
              No <span className="num font-normal">{cents(1 - yp)}</span>
            </button>
          </div>

          {side && q && (
            <BetTicket
              side={side}
              question={p.question}
              price={side === "YES" ? yp : 1 - yp}
              card={card}
              onClose={closeTicket}
            >
              <div className="grid grid-cols-4 gap-1.5">
                {AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a)}
                    aria-pressed={amount === a}
                    className={clsx(
                      "cursor-pointer num min-h-8 rounded border py-1.5 text-xs pointer-coarse:min-h-11",
                      amount === a ? "border-text bg-text text-bg" : "border-line text-muted hover:text-text",
                    )}
                  >
                    ${a}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-muted">Shares · avg price</span>
                <span className="num">
                  {num(q.shares, 1)} @ {cents(q.avg)}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-muted">Payout if {side}</span>
                <span className="num font-semibold text-up">{usd(q.shares)}</span>
              </div>
              {(side === "YES" ? yp : 1 - yp) < 0.1 && (
                <p className="mt-1 text-xs text-warn">Long shot: most bets at this price lose the full stake.</p>
              )}
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-muted">Profit if right</span>
                <span className="num text-up">
                  +{usd(q.shares - amount)} ({Math.round(((q.shares - amount) / amount) * 100)}%)
                </span>
              </div>
              <button
                disabled={amount > cash}
                onClick={place}
                className={clsx(
                  "cursor-pointer mt-3 h-10 w-full rounded text-sm font-semibold text-on-status disabled:cursor-not-allowed disabled:bg-panel disabled:font-medium disabled:text-muted",
                  side === "YES" ? "bg-up" : "bg-down",
                )}
              >
                {amount > cash
                  ? `Not enough cash · need ${usd(amount - cash)} more`
                  : reviewing
                    ? `Confirm · ${usd(amount, 0)} on ${side} (${Math.round((amount / cash) * 100)}% of cash)`
                    : `Bet ${usd(amount, 0)} on ${side}`}
              </button>
              {reviewing && (
                <div className="mt-2 flex items-center justify-between text-xs text-muted" role="status">
                  <span>Large bet. Check it, then confirm. Esc cancels.</span>
                  <button className="cursor-pointer text-text underline underline-offset-2" onClick={() => setReview(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </BetTicket>
          )}
          </div>
        </>
      )}

      {fillId && <FillReceipt tradeId={fillId} quoted={quoted} onDone={clearFill} />}

      {!st.resolved && staking && CHAIN === "near" && <NearStakePanel marketId={p.id} />}

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

      {!st.resolved && (
        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {!staking && CHAIN === "near" && (
              <button
                onClick={() => setStaking(true)}
                className="cursor-pointer inline-flex min-h-6 items-center gap-1.5 font-medium text-near hover:underline pointer-coarse:min-h-11"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-near" aria-hidden /> Stake testnet NEAR on-chain
              </button>
            )}
            {!compact && (
              <button
                onClick={() => setRules((v) => !v)}
                aria-expanded={rules}
                className="cursor-pointer inline-flex min-h-6 items-center gap-1.5 hover:text-text pointer-coarse:min-h-11"
              >
                <Gavel size={12} /> Rules
              </button>
            )}
          </div>
          {rules && <p className="mt-2 text-xs leading-relaxed text-muted">{p.rules}</p>}
        </div>
      )}
    </div>
  );
}

const PHONE = "(max-width: 767.98px)";
function subscribePhone(cb: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(PHONE);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}
const isPhone = () => typeof window.matchMedia === "function" && window.matchMedia(PHONE).matches;

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bet ticket for one card. md+: a non-modal popover hanging under the Yes/No buttons, over the grid, closed by
 * Esc, a click outside the card or focus leaving it. Phones: a modal bottom sheet with a backdrop, focus trap
 * and scroll lock. Either way focus moves into the ticket on open and back to the side button on close.
 */
function BetTicket({
  side,
  question,
  price,
  card,
  onClose,
  children,
}: {
  side: "YES" | "NO";
  question: string;
  price: number;
  card: RefObject<HTMLDivElement | null>;
  onClose: (refocus: boolean) => void;
  children: ReactNode;
}) {
  const modal = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Move focus in once per open (not on YES/NO switches), and keep the popover on screen.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    el.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    if (typeof el.scrollIntoView === "function" && !isPhone()) el.scrollIntoView({ block: "nearest" });
  }, []);

  // Non-modal popover: a pointer press or focus outside the card dismisses it without stealing focus back.
  useEffect(() => {
    if (modal) return;
    const outside = (t: EventTarget | null) => t instanceof Node && !card.current?.contains(t);
    const onDown = (e: PointerEvent) => outside(e.target) && onClose(false);
    const onFocus = (e: FocusEvent) => outside(e.target) && onClose(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocus);
    };
  }, [modal, card, onClose]);

  // Modal sheet: lock page scroll and keep Tab inside the sheet.
  useEffect(() => {
    if (!modal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modal]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!modal || e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {modal && (
        <div aria-hidden="true" className="fixed inset-0 z-50 bg-[var(--scrim)] motion-safe:animate-[fade-in_200ms_ease-out]" onClick={() => onClose(true)} />
      )}
      <div
        ref={panel}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={clsx(
          "z-50 border-line-2 bg-panel-2 shadow-lift",
          // Phones: bottom sheet clear of the home indicator.
          "fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t border-t px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]",
          // md+: popover anchored under the Yes/No buttons, painted over the card below it.
          "md:absolute md:inset-x-0 md:bottom-auto md:top-full md:z-30 md:mt-2 md:max-h-none md:overflow-visible md:rounded md:border md:p-3",
        )}
      >
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-[13px] font-semibold">
              <span className={side === "YES" ? "text-up" : "text-down"}>{side === "YES" ? "Yes" : "No"}</span> at{" "}
              <span className="num">{cents(price)}</span>
            </h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted md:hidden">{question}</p>
          </div>
          <button
            onClick={() => onClose(true)}
            aria-label="Close ticket"
            className="cursor-pointer -mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded text-muted hover:bg-panel hover:text-text md:h-7 md:w-7"
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
