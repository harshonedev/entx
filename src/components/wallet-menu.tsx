"use client";

import { CHAIN_ON } from "@/lib/env";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useNear } from "@/lib/near";
import { shortKey } from "@/lib/format";

/**
 * One entry point for both chains. Each row says what the wallet is for and what it costs,
 * so connecting is a decision, not a guess between two vendor buttons.
 */
export function WalletMenu() {
  const near = useNear();
  const sol = useWallet();
  const modal = useWalletModal();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const solKey = CHAIN_ON.solana ? sol.publicKey?.toBase58() : undefined;
  const nearId = CHAIN_ON.near ? near.accountId : null;
  const count = (nearId ? 1 : 0) + (solKey ? 1 : 0);
  const label =
    count === 0 ? "Connect wallet" : count === 2 ? "2 wallets" : (nearId ?? (solKey ? shortKey(solKey) : ""));

  const rows = [
    {
      key: "near",
      name: "NEAR testnet",
      dot: "bg-near",
      account: near.accountId,
      purpose: "Stake on prediction pools and sign trade receipts. Each receipt holds a 0.01 Ⓝ deposit; the unused part is refunded.",
      connect: () => near.connect(),
      disconnect: () => near.disconnect(),
      disabled: !near.ready,
    },
    {
      key: "sol",
      name: "Solana devnet",
      dot: "bg-sol",
      account: solKey ? shortKey(solKey) : null,
      purpose: "Sign trade receipts with the Memo program. Uses free devnet SOL.",
      connect: () => modal.setVisible(true),
      disconnect: () => void sol.disconnect(),
      disabled: false,
    },
  ].filter((r) => CHAIN_ON[r.key === "sol" ? "solana" : "near"]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count === 0 ? "Connect wallet" : undefined}
        className={clsx(
          "cursor-pointer flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded px-3 text-[12.5px] font-medium transition-colors pointer-coarse:h-11",
          // Optional: a wallet only signs receipts and stakes NEAR, so the button stays quiet rather than demanding.
          count === 0 ? "bg-accent-fill text-accent-ink hover:bg-accent-fill-hover" : "border border-bar-ink/25 text-bar-ink hover:border-bar-ink/60",
        )}
      >
        {count === 0 ? (
          <Wallet size={14} />
        ) : (
          <span className="flex -space-x-0.5">
            {nearId && <span className="h-1.5 w-1.5 rounded-full bg-near" />}
            {solKey && <span className="h-1.5 w-1.5 rounded-full bg-sol" />}
          </span>
        )}
        {count === 0 ? (
          <span className="hidden sm:inline">Connect wallet</span>
        ) : (
          <span className="sr-only max-w-[140px] truncate sm:not-sr-only">{label}</span>
        )}
        <ChevronDown size={13} className={clsx("hidden motion-safe:transition-transform sm:block", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Wallets"
          className="absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-32px))] border-2 border-ink bg-panel p-1.5 text-text shadow-lift"
        >
          <p className="px-2.5 pb-2 pt-1.5 text-xs leading-relaxed text-muted">
            Trading works without a wallet. Connect one to put your activity on-chain.
          </p>
          {rows.map((r) => (
            <div key={r.key} className="rounded px-2.5 py-2.5 hover:bg-panel">
              <div className="flex items-center gap-2">
                <span className={clsx("h-1.5 w-1.5 rounded-full", r.dot)} />
                <span className="text-[13px] font-medium">{r.name}</span>
                {r.account ? (
                  <button
                    onClick={r.disconnect}
                    className="cursor-pointer ml-auto text-xs text-muted underline-offset-2 hover:text-text hover:underline"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setOpen(false);
                      r.connect();
                    }}
                    disabled={r.disabled}
                    className="cursor-pointer ml-auto h-7 rounded bg-text px-2.5 text-xs font-semibold text-bg disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
              {r.account && <div className="num mt-0.5 pl-3.5 text-xs text-text/80">{r.account}</div>}
              <p className="mt-1 pl-3.5 text-xs leading-relaxed text-muted">{r.purpose}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
