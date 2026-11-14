"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowDown, Loader2, Route } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useNear } from "@/lib/near";
import { usd } from "@/lib/format";

const ORIGINS = [
  { id: "nep141:sol.omft.near", label: "SOL", chain: "Solana", amount: 1 },
  { id: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", label: "USDC", chain: "Solana", amount: 50 },
  { id: "nep141:eth.omft.near", label: "ETH", chain: "Ethereum", amount: 0.05 },
  { id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", label: "USDC", chain: "Base", amount: 50 },
  { id: "nep141:arb.omft.near", label: "ETH", chain: "Arbitrum", amount: 0.05 },
] as const;

interface Quote {
  amountInFormatted: string;
  amountInUsd: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  timeEstimate: number;
}

/** Cross-chain funding via NEAR Intents (1Click). Dry-run only: live mainnet price, no funds move. */
export function IntentsPanel() {
  const [origin, setOrigin] = useState<(typeof ORIGINS)[number]>(ORIGINS[0]);
  const [amount, setAmount] = useState<string>(String(ORIGINS[0].amount));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const { publicKey } = useWallet();
  const { accountId } = useNear();

  useEffect(() => {
    const n = Number(amount);
    if (!n || n <= 0) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/intents/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            originAsset: origin.id,
            amount: n,
            refundTo: publicKey?.toBase58(),
            recipient: accountId ?? undefined,
          }),
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Quote failed");
        setQuote(json.quote);
        setAt(json.timestamp ?? new Date().toISOString());
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setQuote(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [origin, amount, publicKey, accountId]);

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <Route size={14} className="text-near" />
        <span className="h-panel">Fund from any chain · NEAR Intents</span>
        <span className="ml-auto rounded-sm border border-line-2 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-near">
          Live dry-run
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        ENTX settles in USDC on NEAR. Intents route deposits from other chains in one step. Quotes below are
        live mainnet prices from the 1Click API with <code className="text-text/80">dry: true</code> — no deposit
        address is created and no funds move.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ORIGINS.map((o) => (
          <button
            key={o.id}
            onClick={() => {
              setOrigin(o);
              setAmount(String(o.amount));
            }}
            className={clsx(
              "cursor-pointer rounded-lg border px-2.5 py-1 text-xs",
              origin.id === o.id ? "border-near text-near" : "border-line text-muted hover:text-text",
            )}
          >
            {o.label} <span className="text-faint">· {o.chain}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-line-2 bg-bg p-3">
        <div className="text-[11px] text-faint">You send ({origin.chain})</div>
        <div className="flex items-center">
          <input
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="num h-9 w-full bg-transparent text-lg font-semibold outline-none"
            aria-label="Amount to send"
          />
          <span className="text-sm font-semibold text-muted">{origin.label}</span>
        </div>
        {quote && <div className="num text-[11px] text-faint">≈ {usd(Number(quote.amountInUsd))}</div>}
      </div>
      <div className="-my-2 flex justify-center">
        <span className="z-10 grid h-7 w-7 place-items-center rounded border border-line bg-panel text-muted">
          <ArrowDown size={13} />
        </span>
      </div>
      <div className="rounded-xl border border-line-2 bg-bg p-3">
        <div className="text-[11px] text-faint">ENTX receives (NEAR)</div>
        <div className="flex items-center">
          <div className="num h-9 w-full text-lg font-semibold leading-9">
            {loading ? (
              <Loader2 size={16} className="mt-2.5 animate-spin text-muted" />
            ) : quote ? (
              Number(quote.amountOutFormatted).toLocaleString("en-US", { maximumFractionDigits: 2 })
            ) : (
              "—"
            )}
          </div>
          <span className="text-sm font-semibold text-muted">USDC</span>
        </div>
        {quote && (
          <div className="num flex justify-between text-[11px] text-faint">
            <span>min {(Number(quote.minAmountOut) / 1e6).toFixed(2)} · ~{quote.timeEstimate}s</span>
            {at && <span>quoted {new Date(at).toLocaleTimeString()}</span>}
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-xs text-down">{error}</div>}
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Production flow: request the same quote with <code>dry: false</code>, send funds to the returned
        deposit address, poll <code>/v0/status</code>, then credit the ENTX account on NEAR.
      </p>
    </div>
  );
}
