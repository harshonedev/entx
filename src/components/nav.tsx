"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Droplets,
  Menu,
  Search,
  X,
} from "lucide-react";
import { ASSETS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { yesPrice } from "@/lib/engine";
import { STARTING_CASH, change24h, portfolioValue, priceOf, useMarket } from "@/store/market";
import { compactUsd, pct, usd } from "@/lib/format";
import { useAirdrop } from "@/lib/solana";
import { useNear } from "@/lib/near";
import { Poster } from "./poster";
import { WalletMenu } from "./wallet-menu";
import { DemoControls } from "./demo-controls";
import { ModeBadge, SettingsMenu } from "./settings-menu";
import { CHAIN, CHAIN_LABEL, CHAIN_NAMES, CHAIN_ON, IS_DEMO, MULTICHAIN } from "@/lib/env";
import { Change, Dim, signTone } from "./ui";
import { Wordmark } from "./logo";

type NavLink = { href: string; label: string };

const LINKS: NavLink[] = [
  { href: "/markets", label: "Discover" },
  { href: "/predictions", label: "Predictions" },
  { href: "/epi", label: "EPI" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/onchain", label: "On-chain" },
];

const isActive = (href: string, path: string) =>
  href === "/markets" ? path === "/markets" || path.startsWith("/asset") : path.startsWith(href);

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** App frame: ink top bar with the section nav, a dateline strip (market stats, receipts, portfolio), then the page. */
export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar onMenu={() => setOpen(true)} />
      <Dateline />
      {open && <MobileDrawer onClose={closeMenu} />}
      <div className="flex min-w-0 flex-1 flex-col items-center overflow-x-clip">{children}</div>
    </div>
  );
}

/** Mobile navigation drawer: modal dialog with focus trap, Esc to close, scroll lock and focus return. */
function MobileDrawer({ onClose }: { onClose: () => void }) {
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    (el.querySelector<HTMLElement>('a[aria-current="page"]') ?? focusables()[0])?.focus();

    if (!reducedMotion()) {
      el.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }], { duration: 240, easing: EASE_OUT });
      backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!el.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnTo?.focus();
    };
  }, [onClose]);

  const path = usePathname();
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div ref={backdrop} aria-hidden="true" className="cursor-pointer absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <aside ref={panel} className="relative flex h-full w-72 flex-col border-r-2 border-ink bg-bg">
        <div className="flex h-[52px] shrink-0 items-center bg-bar px-4 text-bar-ink">
          <Link href="/" onClick={onClose} aria-label="ENTX home" className="cursor-pointer inline-flex min-h-11 items-center">
            <Wordmark className="h-3.5 w-auto" />
          </Link>
          <button
            onClick={onClose}
            className="cursor-pointer ml-auto grid h-11 w-11 place-items-center text-bar-ink/70 transition-colors hover:text-bar-ink"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto overscroll-contain px-4 pt-2">
          <ul>
            {LINKS.map(({ href, label }) => {
              const active = isActive(href, path);
              return (
                <li key={href} className="border-b border-line">
                  <Link
                    href={href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "cond cursor-pointer flex h-12 items-center text-[20px] font-bold uppercase tracking-[0.04em]",
                      active ? "text-accent" : "text-text hover:text-accent",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="space-y-4 border-t-2 border-ink p-4">
          <AccountCard onNavigate={onClose} />
          <ReceiptToggles />
        </div>
      </aside>
    </div>
  );
}

function AccountCard({ onNavigate }: { onNavigate?: () => void }) {
  const total = useMarket((s) => portfolioValue(s).total);
  const ret = total / STARTING_CASH - 1;
  return (
    <Link href="/portfolio" onClick={onNavigate} className="cursor-pointer block border border-line bg-panel p-3 transition-colors hover:bg-panel-2">
      <div className="label">Portfolio value</div>
      <div className="num mt-1 text-[19px] font-semibold tracking-[-0.01em]">
        <Dim text={usd(total)} />
      </div>
      <div className={clsx("num mt-0.5 text-xs", signTone(ret))}>{pct(ret)} all time</div>
    </Link>
  );
}

/** Compact portfolio figure for the dateline strip. */
function AccountFigure() {
  const total = useMarket((s) => portfolioValue(s).total);
  const ret = total / STARTING_CASH - 1;
  return (
    <Link
      href="/portfolio"
      aria-label={`Portfolio value ${usd(total)}, ${pct(ret)} all time`}
      className="cursor-pointer inline-flex h-full items-center gap-2 border-l border-line pl-4 hover:text-accent"
    >
      <span className="text-muted">Portfolio</span>
      <span className="num font-semibold">{usd(total)}</span>
      <span className={clsx("num", signTone(ret))}>{pct(ret)}</span>
    </Link>
  );
}

function ReceiptToggles({ inline = false }: { inline?: boolean }) {
  const chains = useMarket((s) => s.chains);
  const setChains = useMarket((s) => s.setChains);
  const { accountId } = useNear();
  const { connected: solConnected } = useWallet();
  // A receipt toggle only means something once that chain's wallet is connected.
  const live = { solana: solConnected, near: !!accountId };
  const missing = MULTICHAIN
    ? live.solana ? "NEAR" : live.near ? "Solana" : "Solana or NEAR"
    : CHAIN_NAMES[0];
  const allLive = (["solana", "near"] as const).every((k) => !CHAIN_ON[k] || live[k]);
  const hintId = inline ? "receipts-hint-inline" : "receipts-hint";
  const labelId = inline ? "receipts-label-inline" : "receipts-label";
  return (
    <div role="group" aria-labelledby={labelId} className={clsx(inline && "flex h-full items-center gap-1")}>
      <div id={labelId} className={clsx(inline ? "mr-1 text-muted" : "label mb-2")}>
        {inline ? "Receipts" : "On-chain receipts"}
      </div>
      <div className={clsx(inline ? "flex items-center gap-1" : "space-y-1")}>
        {(
          [
            ["solana", inline ? "Solana" : "Solana devnet", "bg-sol"],
            ["near", inline ? "NEAR" : "NEAR testnet", "bg-near"],
          ] as const
        ).filter(([k]) => CHAIN_ON[k]).map(([k, label, dot]) => {
          const on = live[k] && chains[k];
          return (
          <button
            key={k}
            // aria-disabled (not disabled) keeps the row focusable, so screen readers reach it and hear why it is off.
            onClick={() => live[k] && setChains({ [k]: !chains[k] })}
            aria-disabled={!live[k] || undefined}
            aria-pressed={on}
            aria-describedby={live[k] ? undefined : hintId}
            title={live[k] ? undefined : `Connect a ${missing} wallet to sign receipts for your trades.`}
            className={clsx(
              "flex items-center gap-2 text-[12.5px] transition-colors",
              inline ? "h-7 px-2" : "h-8 w-full px-1",
              live[k] ? "cursor-pointer text-text hover:bg-panel-2" : "cursor-not-allowed text-faint",
            )}
          >
            <span className={clsx("h-1.5 w-1.5 rounded-full", dot, !on && "opacity-30")} />
            <span>{label}</span>
            <span className={clsx("relative h-3.5 w-6 border border-ink transition-colors", inline ? "" : "ml-auto", on ? "bg-ink" : "bg-transparent")}>
              <span
                className={clsx(
                  "absolute left-[1px] top-[1px] h-2.5 w-2.5 motion-safe:transition-[translate,background-color] motion-safe:duration-150 motion-safe:ease-out",
                  on ? "translate-x-2.5 bg-bg" : "bg-line-2",
                )}
              />
            </span>
          </button>
          );
        })}
      </div>
      {!allLive && (
        <p id={hintId} className={clsx(inline ? "sr-only" : "mt-2 text-xs leading-snug text-muted")}>
          Connect a {missing} wallet to sign receipts for your trades.
        </p>
      )}
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { connected } = useWallet();
  const airdrop = useAirdrop();
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-1.5 bg-bar px-2 text-bar-ink sm:gap-2 sm:px-6">
      <button
        onClick={onMenu}
        className="cursor-pointer grid h-11 w-11 shrink-0 place-items-center text-bar-ink/75 hover:text-bar-ink lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>
      <Link href="/" aria-label="ENTX home" className="cursor-pointer inline-flex min-h-11 shrink-0 items-center pr-2 lg:pr-4">
        <Wordmark className="h-3.5 w-auto" />
      </Link>
      <nav aria-label="Main" className="hidden h-full lg:block">
        <ul className="flex h-full">
          {LINKS.map(({ href, label }) => {
            const active = isActive(href, path);
            return (
              <li key={href} className="h-full">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "cursor-pointer flex h-full items-center border-b-[3px] px-3.5 pt-[3px] text-[13.5px] font-medium transition-colors xl:px-4",
                    active ? "border-accent text-bar-ink" : "border-transparent text-bar-ink/65 hover:text-bar-ink",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <AssetSearch />
        {IS_DEMO && <DemoControls />}
        <SettingsMenu />
        {CHAIN_ON.solana && connected && (
          <button
            onClick={airdrop}
            title="Request 1 devnet SOL to pay for on-chain receipts"
            aria-label="Request devnet SOL airdrop"
            className="cursor-pointer grid h-9 w-9 place-items-center border border-bar-ink/25 text-bar-ink/75 transition-colors hover:text-bar-ink pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <Droplets size={15} />
          </button>
        )}
        <WalletMenu />
      </div>
    </header>
  );
}

/** Dateline strip under the top bar: environment, market-wide stats, receipt toggles and portfolio value. */
function Dateline() {
  return (
    <section aria-label="Market status" className="@container hidden h-10 shrink-0 items-center gap-4 border-b border-ink bg-bg px-6 text-[12px] md:flex">
      <ModeBadge />
      <StatChips />
      <div className="ml-auto flex h-full shrink-0 items-center gap-4">
        <ReceiptToggles inline />
        <AccountFigure />
      </div>
    </section>
  );
}

function StatChips() {
  const markets = useMarket((s) => s.markets);
  const volume = ASSETS.reduce((t, a) => t + markets[a.id].volume24h, 0);
  const avgEpi = ASSETS.reduce((t, a) => t + markets[a.id].epi, 0) / ASSETS.length;
  const avgChg = ASSETS.reduce((t, a) => t + change24h(markets[a.id]), 0) / ASSETS.length;
  // Each stat names the strip width it needs (container query), so lower-priority stats drop out whole
  // instead of being clipped mid-word. Network is the proof judges look for, so it stays longest.
  const chips: [string, ReactNode, string][] = [
    [
      "Network",
      <span key="n" className="flex items-center gap-1.5">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
        {MULTICHAIN ? CHAIN_NAMES.join(" · ") : CHAIN_LABEL[CHAIN]}
      </span>,
      "@min-[860px]:flex",
    ],
    ["All titles 24h", <Change key="c" value={avgChg} />, "@min-[980px]:flex"],
    ["24h Vol", <span key="v" className="num">{compactUsd(volume)}</span>, "@min-[1100px]:flex"],
    ["Avg EPI", <span key="e" className="num">{avgEpi.toFixed(1)}</span>, "@min-[1200px]:flex"],
  ];
  return (
    <div className="flex h-full min-w-0 items-center overflow-hidden">
      {chips.map(([k, v, show]) => (
        <div key={k} className={clsx("hidden h-full shrink-0 items-center gap-2 whitespace-nowrap border-l border-line px-4", show)}>
          <span className="text-muted">{k}</span>
          <span className="font-medium text-text">{v}</span>
        </div>
      ))}
    </div>
  );
}

type SearchItem =
  | { kind: "title"; id: string; href: string; asset: (typeof ASSETS)[number] }
  | { kind: "market"; id: string; href: string; question: string; marketId: string };

const titleItem = (a: (typeof ASSETS)[number]): SearchItem => ({ kind: "title", id: `t-${a.id}`, href: `/asset/${a.id}`, asset: a });
const marketItem = (p: (typeof PREDICTIONS)[number]): SearchItem => ({
  kind: "market",
  id: `m-${p.id}`,
  href: `/predictions/${p.id}`,
  question: p.question,
  marketId: p.id,
});

/** ⌘K search over titles (title or ticker) and prediction markets (question text), grouped, one listbox. */
function AssetSearch() {
  const router = useRouter();
  const markets = useMarket((s) => s.markets);
  const predictions = useMarket((s) => s.predictions);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim().toLowerCase();
  // Every word must appear somewhere, so "dune box" finds "Will Dune … box office …".
  const words = term.split(/\s+/).filter(Boolean);
  const hit = (text: string) => words.every((w) => text.includes(w));
  const titles = ASSETS.filter((a) => hit(`${a.title} ${a.ticker}`.toLowerCase())).slice(0, term ? 5 : 4);
  const bets = PREDICTIONS.filter((p) => hit(`${p.question} ${p.category}`.toLowerCase())).slice(0, term ? 4 : 3);
  // No match: say so, and offer the three most-traded titles instead of an empty dropdown.
  const noMatch = term !== "" && titles.length === 0 && bets.length === 0;
  const groups: { label: string; items: SearchItem[] }[] = noMatch
    ? [
        {
          label: "Most traded titles",
          items: [...ASSETS]
            .sort((a, b) => markets[b.id].volume24h - markets[a.id].volume24h)
            .slice(0, 3)
            .map(titleItem),
        },
      ]
    : [
        { label: "Titles", items: titles.map(titleItem) },
        { label: "Prediction markets", items: bets.map(marketItem) },
      ].filter((g) => g.items.length > 0);
  const results = groups.flatMap((g) => g.items);

  const go = (href: string) => {
    router.push(href);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  const offsets = groups.map((_, g) => groups.slice(0, g).reduce((n, x) => n + x.items.length, 0));
  return (
    <div className="relative">
      {/* Phones: an icon-wide field that opens up on focus. sm+: always-open field. The 2px accent ring on the
          wrapper is the focus indicator (the bare input sits inside it, so it never needs its own outline). */}
      <div className="flex h-9 w-11 items-center gap-2 overflow-hidden border border-bar-ink/20 bg-bar-field px-[14px] text-bar-ink/60 focus-within:w-44 focus-within:border-accent focus-within:text-bar-ink motion-safe:transition-[width] motion-safe:duration-200 sm:w-56 sm:px-3 sm:focus-within:w-56 xl:w-64 xl:focus-within:w-64 pointer-coarse:h-11">
        <Search size={14} className="shrink-0" aria-hidden onClick={() => input.current?.focus()} />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && results[hi]) {
              go(results[hi].href);
            } else if (e.key === "Escape") {
              input.current?.blur();
            }
          }}
          name="q"
          placeholder="Search titles, markets…"
          aria-label="Search titles and markets"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="asset-search-list"
          aria-activedescendant={open && results[hi] ? `search-opt-${results[hi].id}` : undefined}
          className="w-full min-w-0 bg-transparent text-[12.5px] text-bar-ink outline-none placeholder:text-bar-ink/55"
        />
        <kbd className="hidden border border-bar-ink/20 px-1.5 py-0.5 text-[11px] text-bar-ink/60 sm:inline">⌘K</kbd>
      </div>
      {open && results.length > 0 && (
        <div className="absolute right-0 top-11 z-50 max-h-[min(32rem,calc(100dvh-80px))] w-[min(22rem,calc(100vw-32px))] overflow-y-auto overscroll-contain border-2 border-ink bg-panel p-0.5 text-text shadow-lift">
          {noMatch && (
            <p id="asset-search-empty" role="status" className="px-2 pb-1 pt-2 text-[12px] text-muted">
              Nothing matches &ldquo;<span className="text-text">{q.trim()}</span>&rdquo;. Most traded titles:
            </p>
          )}
          <ul id="asset-search-list" role="listbox" aria-label={noMatch ? "Suggested titles" : "Search results"}>
            {groups.map((g, gi) => (
              <li key={g.label} role="presentation">
                {!noMatch && (
                  <div aria-hidden="true" className="px-2 pb-1 pt-2 text-xs font-medium text-muted">
                    {g.label}
                  </div>
                )}
                <ul role="group" aria-label={g.label}>
                  {g.items.map((item, j) => {
                    const i = offsets[gi] + j;
                    return (
                      <li
                        key={item.id}
                        id={`search-opt-${item.id}`}
                        role="option"
                        aria-selected={i === hi}
                        // mousedown (not click) so the input's blur doesn't close the list first
                        onMouseDown={(e) => {
                          e.preventDefault();
                          go(item.href);
                        }}
                        onMouseEnter={() => setHi(i)}
                        className={clsx("flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5", i === hi && "bg-panel-2")}
                      >
                        {item.kind === "title" ? (
                          <>
                            <Poster asset={item.asset} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px]">{item.asset.title}</span>
                              <span className="block text-xs text-muted">{item.asset.ticker}</span>
                            </span>
                            <span className="text-right">
                              <span className="num block text-[12.5px]">{usd(priceOf(markets[item.asset.id]))}</span>
                              <Change value={change24h(markets[item.asset.id])} className="text-xs" />
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug">{item.question}</span>
                            <span className="num shrink-0 text-right text-[12.5px]">
                              {predictions[item.marketId].resolved ?? `${Math.round(yesPrice(predictions[item.marketId].pool) * 100)}%`}
                              <span className="block text-xs text-muted">{predictions[item.marketId].resolved ? "settled" : "YES"}</span>
                            </span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
