"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { Droplets, LogOut } from "lucide-react";
import { portfolioValue, useMarket } from "@/store/market";
import { usd } from "@/lib/format";
import { useAirdrop } from "@/lib/solana";
import { useNear } from "@/lib/near";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/predictions", label: "Predictions" },
  { href: "/epi", label: "EPI Index" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/onchain", label: "On-chain" },
];

export function Nav() {
  const path = usePathname();
  const total = useMarket((s) => portfolioValue(s).total);
  const { connected } = useWallet();
  const airdrop = useAirdrop();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-5 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-black text-accent-ink">
            E
          </span>
          <span className="text-[15px] font-bold tracking-tight">ENTX</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" || path.startsWith("/asset") : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-white/[0.06] text-text" : "text-muted hover:text-text",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <ChainToggles />
          <Link href="/portfolio" className="hidden text-right sm:block">
            <div className="text-[10px] uppercase tracking-wider text-muted">Demo account</div>
            <div className="num text-sm font-semibold">{usd(total)}</div>
          </Link>
          {connected && (
            <button
              onClick={airdrop}
              title="Request 1 devnet SOL to pay for on-chain receipts"
              className="grid h-9 w-9 place-items-center rounded-[10px] border border-line text-muted transition-colors hover:border-sol/50 hover:text-sol"
            >
              <Droplets size={16} />
            </button>
          )}
          <NearButton />
          <WalletMultiButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 lg:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-3 py-1 text-sm text-muted">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function ChainToggles() {
  const chains = useMarket((s) => s.chains);
  const setChains = useMarket((s) => s.setChains);
  return (
    <div
      className="hidden items-center gap-1 rounded-full border border-line p-0.5 text-[11px] xl:flex"
      title="Which chains receive trade receipts"
    >
      <span className="pl-2 pr-1 text-faint">Receipts</span>
      {(
        [
          ["solana", "Solana", "bg-sol"],
          ["near", "NEAR", "bg-near"],
        ] as const
      ).map(([k, label, dot]) => (
        <button
          key={k}
          onClick={() => setChains({ [k]: !chains[k] })}
          aria-pressed={chains[k]}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
            chains[k] ? "bg-white/[0.08] text-text" : "text-faint line-through",
          )}
        >
          <span className={clsx("h-1.5 w-1.5 rounded-full", dot, !chains[k] && "opacity-30")} />
          {label}
        </button>
      ))}
    </div>
  );
}

function NearButton() {
  const { accountId, ready, connect, disconnect } = useNear();
  if (accountId) {
    return (
      <div className="flex h-9 items-center gap-1 rounded-[10px] bg-near pl-3 pr-1 text-[13px] font-semibold text-black">
        <span className="max-w-[140px] truncate">{accountId}</span>
        <button
          onClick={disconnect}
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/10"
          aria-label="Disconnect NEAR wallet"
          title="Disconnect NEAR"
        >
          <LogOut size={13} />
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={connect}
      disabled={!ready}
      className="h-9 rounded-[10px] bg-near px-3.5 text-[13px] font-semibold text-black transition-[filter] hover:brightness-110 disabled:opacity-50"
    >
      Connect NEAR
    </button>
  );
}
