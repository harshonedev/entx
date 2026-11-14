"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Blocks,
  BriefcaseBusiness,
  Droplets,
  Gauge,
  LayoutGrid,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Target,
  X,
  type LucideIcon,
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
import { Change, Dim, SimBadge, signTone } from "./ui";

type NavLink = { href: string; label: string; icon: LucideIcon };

const LINKS: NavLink[] = [
  { href: "/", label: "Discover", icon: LayoutGrid },
  { href: "/predictions", label: "Predictions", icon: Target },
  { href: "/epi", label: "EPI", icon: Gauge },
  { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { href: "/onchain", label: "On-chain", icon: Blocks },
];

const isActive = (href: string, path: string) =>
  href === "/" ? path === "/" || path.startsWith("/asset") : path.startsWith(href);

/**
 * Desktop sidebar collapsed state, persisted in localStorage and shared across tabs. Expanded by default so
 * first-time visitors see every section by name (On-chain included); a stored choice always wins.
 */
const COLLAPSE_KEY = "entx:sidebar-collapsed";
const collapseListeners = new Set<() => void>();
let collapsedMemory = false;

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return collapsedMemory;
  }
}

function writeCollapsed(value: boolean) {
  collapsedMemory = value;
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {}
  collapseListeners.forEach((l) => l());
}

function subscribeCollapsed(listener: () => void) {
  collapseListeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === COLLAPSE_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    collapseListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** App frame: collapsible left sidebar on desktop, off-canvas drawer on mobile, sticky top bar. */
export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  // Only animate width after a user toggle, so a saved "expanded" preference doesn't play on page load.
  const [animate, setAnimate] = useState(false);
  const toggleCollapsed = () => {
    setAnimate(true);
    writeCollapsed(!collapsed);
  };
  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <div className="flex min-h-screen">
      <aside
        id="app-sidebar"
        className={clsx(
          // z-50: sticky makes its own stacking context; the rail tooltip must paint over main + topbar.
          "sticky top-0 z-50 hidden h-screen shrink-0 overflow-hidden border-r border-line bg-bg lg:block",
          animate && "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <Sidebar collapsed={collapsed} animate={animate} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {open && <MobileDrawer onClose={closeMenu} />}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <Topbar onMenu={() => setOpen(true)} />
        {children}
      </div>
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

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div ref={backdrop} aria-hidden="true" className="cursor-pointer absolute inset-0 bg-black/70" onClick={onClose} />
      <aside ref={panel} className="relative h-full w-64 border-r border-line bg-bg">
        <button
          onClick={onClose}
          className="cursor-pointer absolute right-3 top-[18px] grid h-7 w-7 place-items-center rounded text-muted transition-[background-color,color] hover:bg-panel hover:text-text"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
        <Sidebar onNavigate={onClose} />
      </aside>
    </div>
  );
}

function Sidebar({
  onNavigate,
  collapsed = false,
  animate = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  animate?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const path = usePathname();
  // Instant label tooltip for the collapsed rail (hover and keyboard focus). Fixed-positioned so the
  // rail's overflow clip doesn't cut it off.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const hideTip = () => setTip(null);
  const tipProps = (label: string) =>
    collapsed
      ? {
          onPointerEnter: (e: React.PointerEvent<HTMLElement>) => showTip(label, e.currentTarget),
          onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(label, e.currentTarget),
          onPointerLeave: hideTip,
          onBlur: hideTip,
        }
      : {};
  const showTip = (label: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };

  const motion = animate ? "motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]" : "";
  // Labels stay in the DOM (accessible names) and fade with the rail instead of popping.
  const fade = clsx(
    "whitespace-nowrap",
    animate && "motion-safe:transition-opacity motion-safe:duration-150",
    collapsed ? "opacity-0" : "opacity-100",
  );
  const item = (active: boolean) =>
    clsx(
      "cursor-pointer group flex h-10 items-center gap-3 overflow-hidden rounded px-1.5",
      animate && "motion-safe:transition-[width,background-color,color]",
      motion,
      collapsed ? "w-10" : "w-full",
      active ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text",
    );

  return (
    // Fixed inner width on desktop: the rail clips this column, so nothing reflows while it animates.
    <div className="flex h-full w-full flex-col lg:w-60">
      <div className="flex h-16 shrink-0 items-center px-[18px]">
        <Link
          href="/"
          onClick={onNavigate}
          aria-label="ENTX home"
          className="cursor-pointer flex items-center gap-2.5 rounded"
          {...tipProps("Home")}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-text text-[13px] font-semibold text-bg">E</span>
          <span className={clsx(fade, "text-[15px] font-medium tracking-[-0.01em]")}>ENTX</span>
        </Link>
      </div>

      {onToggleCollapsed && (
        <div className="px-3 pt-2">
          <button
            onClick={() => {
              hideTip();
              onToggleCollapsed();
            }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            className={clsx(item(false), "text-[13px]")}
            {...tipProps("Expand sidebar")}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center text-faint group-hover:text-text">
              {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </span>
            <span className={fade} aria-hidden="true">
              Collapse
            </span>
          </button>
        </div>
      )}

      <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pt-2">
        <ul className="space-y-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={clsx(item(active), "text-[13.5px]")}
                  {...tipProps(label)}
                >
                  <span
                    className={clsx(
                      "grid h-7 w-7 shrink-0 place-items-center rounded",
                      active ? "bg-accent/[0.14] text-accent" : "text-faint group-hover:text-text",
                    )}
                  >
                    <Icon size={15} />
                  </span>
                  <span className={fade}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        inert={collapsed}
        aria-hidden={collapsed || undefined}
        className={clsx(
          "space-y-4 p-4",
          animate && "motion-safe:transition-[opacity,visibility] motion-safe:duration-150",
          collapsed && "invisible opacity-0",
        )}
      >
        <AccountCard onNavigate={onNavigate} />
        <ReceiptToggles />
      </div>

      {collapsed && tip && (
        <div
          aria-hidden="true"
          style={{ top: tip.top }}
          className="pointer-events-none fixed left-[72px] z-50 -translate-y-1/2 whitespace-nowrap rounded border border-line-2 bg-panel-2 px-2 py-1 text-[12px] text-text"
        >
          {tip.label}
        </div>
      )}
    </div>
  );
}

function AccountCard({ onNavigate }: { onNavigate?: () => void }) {
  const total = useMarket((s) => portfolioValue(s).total);
  const ret = total / STARTING_CASH - 1;
  return (
    <Link href="/portfolio" onClick={onNavigate} className="cursor-pointer block rounded bg-panel p-3.5 transition-colors hover:bg-panel-2">
      <div className="label">Portfolio value</div>
      <div className="num mt-1 text-[19px] font-medium tracking-[-0.02em]">
        <Dim text={usd(total)} />
      </div>
      <div className={clsx("num mt-0.5 text-xs", signTone(ret))}>{pct(ret)} all time</div>
    </Link>
  );
}

function ReceiptToggles() {
  const chains = useMarket((s) => s.chains);
  const setChains = useMarket((s) => s.setChains);
  const { accountId } = useNear();
  const { connected: solConnected } = useWallet();
  // A receipt toggle only means something once that chain's wallet is connected.
  const live = { solana: solConnected, near: !!accountId };
  const missing = live.solana ? "NEAR" : live.near ? "Solana" : "Solana or NEAR";
  return (
    <div role="group" aria-labelledby="receipts-label">
      <div id="receipts-label" className="label mb-2 px-0.5">On-chain receipts</div>
      <div className="space-y-1">
        {(
          [
            ["solana", "Solana devnet", "bg-sol"],
            ["near", "NEAR testnet", "bg-near"],
          ] as const
        ).map(([k, label, dot]) => {
          const on = live[k] && chains[k];
          return (
          <button
            key={k}
            // aria-disabled (not disabled) keeps the row focusable, so screen readers reach it and hear why it is off.
            onClick={() => live[k] && setChains({ [k]: !chains[k] })}
            aria-disabled={!live[k] || undefined}
            aria-pressed={on}
            aria-describedby={live[k] ? undefined : "receipts-hint"}
            className={clsx(
              "flex h-8 w-full items-center gap-2.5 rounded px-2 text-[12.5px] text-muted transition-colors",
              live[k] ? "cursor-pointer hover:bg-panel hover:text-text" : "cursor-not-allowed",
            )}
          >
            <span className={clsx("h-1.5 w-1.5 rounded-full", dot, !on && "opacity-30")} />
            <span className={clsx(!live[k] && "text-faint")}>{label}</span>
            <span
              className={clsx(
                "relative ml-auto h-4 w-7 rounded-sm transition-colors",
                on ? "bg-text" : "bg-panel-2",
              )}
            >
              <span
                className={clsx(
                  "absolute left-0.5 top-0.5 h-3 w-3 rounded-[2px] motion-safe:transition-[translate,background-color] motion-safe:duration-150 motion-safe:ease-out",
                  on ? "translate-x-3 bg-bg" : "bg-faint",
                )}
              />
            </span>
          </button>
          );
        })}
      </div>
      {!(live.solana && live.near) && (
        <p id="receipts-hint" className="mt-2 px-0.5 text-xs leading-snug text-muted">
          Connect a {missing} wallet to sign receipts for your trades.
        </p>
      )}
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { connected } = useWallet();
  const airdrop = useAirdrop();
  return (
    <header className="@container sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-bg px-4 sm:px-6 lg:px-8">
      <button
        onClick={onMenu}
        className="cursor-pointer grid h-11 w-11 shrink-0 place-items-center rounded bg-panel text-muted hover:text-text lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={16} />
      </button>
      <Link href="/" className="cursor-pointer inline-flex min-h-11 min-w-11 items-center text-[15px] font-medium tracking-[-0.01em] md:hidden">
        ENTX
      </Link>
      <StatChips />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <AssetSearch />
        <DemoControls />
        {connected && (
          <button
            onClick={airdrop}
            title="Request 1 devnet SOL to pay for on-chain receipts"
            aria-label="Request devnet SOL airdrop"
            className="cursor-pointer grid h-9 w-9 place-items-center rounded bg-panel text-muted transition-colors hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <Droplets size={15} />
          </button>
        )}
        <WalletMenu />
      </div>
    </header>
  );
}

function StatChips() {
  const markets = useMarket((s) => s.markets);
  const volume = ASSETS.reduce((t, a) => t + markets[a.id].volume24h, 0);
  const avgEpi = ASSETS.reduce((t, a) => t + markets[a.id].epi, 0) / ASSETS.length;
  const avgChg = ASSETS.reduce((t, a) => t + change24h(markets[a.id]), 0) / ASSETS.length;
  // Each chip names the header width it needs (container query on <header>), so lower-priority stats drop out
  // whole instead of being clipped mid-word. Testnets is the proof judges look for, so it stays longest.
  const chips: [string, ReactNode, string][] = [
    [
      "Testnets",
      <span key="n" className="flex items-center gap-1.5">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
        NEAR · Solana
      </span>,
      "@min-[820px]:flex",
    ],
    ["All titles 24h", <Change key="c" value={avgChg} />, "@min-[880px]:flex"],
    ["24h Vol", <span key="v" className="num">{compactUsd(volume)}</span>, "@min-[1000px]:flex"],
    ["Avg EPI", <span key="e" className="num">{avgEpi.toFixed(1)}</span>, "@min-[1100px]:flex"],
  ];
  return (
    <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden md:flex">
      <span title="Prices, volume and EPI moves are simulated; chains are real testnets">
        <SimBadge />
      </span>
      {chips.map(([k, v, show]) => (
        <div key={k} className={clsx("hidden h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded bg-panel px-3 text-[12px]", show)}>
          <span className="text-muted">{k}</span>
          <span className="text-text">{v}</span>
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
      <div className="flex h-9 w-11 items-center gap-2 overflow-hidden rounded bg-panel px-[15px] text-muted ring-1 ring-transparent focus-within:w-44 focus-within:text-text focus-within:ring-2 focus-within:ring-accent motion-safe:transition-[width] motion-safe:duration-200 sm:w-56 sm:px-3 sm:focus-within:w-56 pointer-coarse:h-11">
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
          className="w-full min-w-0 bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
        />
        <kbd className="hidden rounded-sm bg-panel-2 px-1.5 py-0.5 text-xs text-muted sm:inline">⌘K</kbd>
      </div>
      {open && results.length > 0 && (
        <div className="absolute right-0 top-11 z-50 max-h-[min(32rem,calc(100dvh-80px))] w-[min(22rem,calc(100vw-32px))] overflow-y-auto overscroll-contain rounded border border-line-2 bg-panel p-0.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
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
