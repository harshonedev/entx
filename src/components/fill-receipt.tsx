"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { useMarket } from "@/store/market";
import { nearTxUrl } from "@/lib/near-config";
import { cents, explorerTx, num, usd } from "@/lib/format";

/**
 * Inline confirmation shown under a ticket's button right after a fill: what was filled, that it was
 * simulated, and where the on-chain receipt is (if a wallet is signing one). It stays until dismissed or
 * replaced by the next fill, so there is no time limit on reading it (WCAG 2.2.1). Each new fill scrolls it
 * into view if the ticket's button sits near the bottom of the screen, smoothly unless motion is reduced.
 */
export function FillReceipt({
  tradeId,
  unit,
  quoted,
  onDone,
}: {
  tradeId: string;
  /** Ticker for spot trades; omitted for prediction bets (shares are priced in cents). */
  unit?: string;
  /** Quantity the ticket showed at click time; the receipt explains it when the live fill differs. */
  quoted?: number;
  onDone: () => void;
}) {
  const t = useMarket((s) => s.trades.find((x) => x.id === tradeId));
  const box = useRef<HTMLDivElement>(null);
  const shown = Boolean(t);

  useEffect(() => {
    if (!shown) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [tradeId, shown]);

  if (!t) return null;
  const isBet = t.kind === "YES" || t.kind === "NO";
  const qtyText = (q: number) => (isBet ? num(q, 1) : num(q, q % 1 ? 2 : 0));
  const what = isBet
    ? `${qtyText(t.qty)} ${t.kind} shares @ ${cents(t.price)} · pays ${usd(t.qty)} if right`
    : `${t.kind === "BUY" ? "Bought" : "Sold"} ${qtyText(t.qty)} ${unit ?? t.label} @ ${usd(t.price)} (incl. fee)`;
  // Say so whenever the live fill reads differently from what the ticket showed, however small.
  const failed = t.nearStatus === "failed" || t.sigStatus === "failed";
  const drifted = quoted !== undefined && quoted > 0 && qtyText(quoted) !== qtyText(t.qty);

  return (
    <div ref={box} className="toast-in mt-2 scroll-mb-4 rounded border border-line-2 bg-panel-2 p-3 text-xs" role="status">
      <div className="flex items-start gap-2">
        <Check size={14} className="mt-0.5 shrink-0 text-up" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-text">
            Filled · <span className="num">{usd(t.total)}</span>
            <span className="ml-1.5 font-normal text-muted">simulated</span>
          </div>
          <div className="num mt-0.5 text-muted">{what}</div>
          {drifted && (
            <div className="num mt-0.5 text-faint">
              Ticket showed {qtyText(quoted!)}; the price moved before the fill, so these are the filled figures.
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {!failed && (
              <Link href="/portfolio" className="cursor-pointer inline-flex min-h-6 items-center text-text underline underline-offset-2">
                View in portfolio
              </Link>
            )}
            {t.nearStatus === "pending" && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Loader2 size={11} className="animate-spin" /> Signing NEAR receipt…
              </span>
            )}
            {t.nearTx && t.nearStatus === "confirmed" && (
              <a href={nearTxUrl(t.nearTx)} target="_blank" rel="noreferrer" className="cursor-pointer inline-flex min-h-6 items-center gap-1 text-near hover:underline">
                NEAR receipt <ExternalLink size={10} />
              </a>
            )}
            {t.sig && t.sigStatus === "confirmed" && (
              <a href={explorerTx(t.sig)} target="_blank" rel="noreferrer" className="cursor-pointer inline-flex min-h-6 items-center gap-1 text-sol hover:underline">
                Solana receipt <ExternalLink size={10} />
              </a>
            )}
            {failed && (
              <span className="inline-flex flex-wrap items-center gap-x-1.5 text-down">
                Receipt not signed.
                <Link
                  href="/portfolio#trade-history"
                  className="cursor-pointer inline-flex min-h-6 items-center text-text underline underline-offset-2 hover:text-accent"
                >
                  Retry in Portfolio
                </Link>
              </span>
            )}
          </div>
        </div>
        <button onClick={onDone} className="cursor-pointer -m-1 p-1 text-faint hover:text-text" aria-label="Dismiss fill confirmation">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
