"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Blocks,
  BriefcaseBusiness,
  Droplets,
  Gauge,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { ASSETS } from "@/lib/assets";
import { STARTING_CASH, change24h, portfolioValue, priceOf, useMarket } from "@/store/market";
import { compactUsd, pct, usd } from "@/lib/format";
import { useAirdrop } from "@/lib/solana";
import { useNear } from "@/lib/near";
import { Poster } from "./poster";
import { Change, Dim, signTone } from "./ui";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

type NavLink = { href: string; label: string; icon: LucideIcon };

const LINKS: NavLink[] = [
  { href: "/", label: "Discover", icon: LayoutGrid },
  { href: "/predictions", label: "Predictions", icon: Target },
  { href: "/epi", label: "EPI Index", icon: Gauge },
  { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { href: "/onchain", label: "On-chain", icon: Blocks },
];

const isActive = (href: string, path: string) =>
  href === "/" ? path === "/" || path.startsWith("/asset") : path.startsWith(href);

/** App frame: fixed left sidebar on desktop, off-canvas drawer on mobile, sticky top bar. */
/** Desktop sidebar collapsed state (collapsed by default), persisted in localStorage and shared across tabs. */
const COLLAPSE_KEY = "entx:sidebar-collapsed";
const collapseListeners = new Set<() => void>();
let collapsedMemory = true;

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) !== "0";
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

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => true);
  const toggleCollapsed = () => writeCollapsed(!collapsed);

  return (
    <div className="flex min-h-screen">
      <aside
        className={clsx(
          "sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-line bg-bg motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="cursor-pointer absolute inset-0 bg-black/70" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 border-r border-line bg-bg">
            <button
              onClick={() => setOpen(false)}
              className="cursor-pointer absolute right-3 top-5 grid h-7 w-7 place-items-center rounded text-muted hover:text-text"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <Topbar onMenu={() => setOpen(true)} />
        {children}
      </div>
    </div>
  );
}

function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className={clsx("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "justify-between pl-5 pr-3")}>
        <Link
          href="/"
          onClick={onNavigate}
          aria-label={collapsed ? "ENTX home" : undefined}
          className="cursor-pointer flex items-center gap-2.5"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-text text-[13px] font-semibold text-bg">E</span>
          {!collapsed && <span className="text-[15px] font-medium tracking-[-0.01em]">ENTX</span>}
        </Link>
        {onToggleCollapsed && !collapsed && (
          <CollapseButton collapsed={false} onClick={onToggleCollapsed} />
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 pt-4">
        {collapsed && onToggleCollapsed ? (
          <div className="mb-3 flex justify-center">
            <CollapseButton collapsed onClick={onToggleCollapsed} />
          </div>
        ) : (
          <div className="mb-3 px-2 text-[13px] text-muted">Menu</div>
        )}
        <ul className="space-y-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={clsx(
                    "cursor-pointer flex h-10 items-center gap-3 rounded text-[13.5px] transition-colors",
                    collapsed ? "justify-center" : "px-1.5",
                    active ? "bg-panel text-text" : "text-muted hover:text-text",
                  )}
                >
                  <span
                    className={clsx(
                      "grid h-7 w-7 place-items-center rounded",
                      active ? "bg-accent/[0.14] text-accent" : "text-faint",
                    )}
                  >
                    <Icon size={15} />
                  </span>
                  <span className={clsx(collapsed && "sr-only")}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!collapsed && (
        <div className="space-y-4 p-4">
          <AccountCard onNavigate={onNavigate} />
          <ReceiptToggles />
        </div>
      )}
    </div>
  );
}

function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="cursor-pointer grid h-8 w-8 place-items-center rounded text-muted transition-colors hover:bg-panel hover:text-text"
    >
      {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
    </button>
  );
}

function AccountCard({ onNavigate }: { onNavigate?: () => void }) {
  const total = useMarket((s) => portfolioValue(s).total);
  const ret = total / STARTING_CASH - 1;
  return (
    <Link href="/portfolio" onClick={onNavigate} className="cursor-pointer block rounded bg-panel p-3.5 transition-colors hover:bg-panel-2">
      <div className="label">Demo balance</div>
      <div className="num mt-1 text-[19px] font-medium tracking-[-0.02em]">
        <Dim text={usd(total)} />
      </div>
      <div className={clsx("num mt-0.5 text-[11.5px]", signTone(ret))}>{pct(ret)} all time</div>
    </Link>
  );
}

function ReceiptToggles() {
  const chains = useMarket((s) => s.chains);
  const setChains = useMarket((s) => s.setChains);
  return (
    <div title="Which chains receive trade receipts">
      <div className="label mb-2 px-0.5">On-chain receipts</div>
      <div className="space-y-1">
        {(
          [
            ["solana", "Solana devnet", "bg-sol"],
            ["near", "NEAR testnet", "bg-near"],
          ] as const
        ).map(([k, label, dot]) => (
          <button
            key={k}
            onClick={() => setChains({ [k]: !chains[k] })}
            aria-pressed={chains[k]}
            className="cursor-pointer flex h-8 w-full items-center gap-2.5 rounded px-2 text-[12.5px] text-muted transition-colors hover:bg-panel hover:text-text"
          >
            <span className={clsx("h-1.5 w-1.5 rounded-full", dot, !chains[k] && "opacity-30")} />
            <span className={clsx(!chains[k] && "text-faint")}>{label}</span>
            <span
              className={clsx(
                "relative ml-auto h-4 w-7 rounded-sm transition-colors",
                chains[k] ? "bg-text" : "bg-panel-2",
              )}
            >
              <span
                className={clsx(
                  "absolute left-0.5 top-0.5 h-3 w-3 rounded-[2px] motion-safe:transition-[translate,background-color] motion-safe:duration-150 motion-safe:ease-out",
                  chains[k] ? "translate-x-3 bg-bg" : "bg-faint",
                )}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { connected } = useWallet();
  const airdrop = useAirdrop();
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-bg px-4 sm:px-6 lg:px-8">
      <button
        onClick={onMenu}
        className="cursor-pointer grid h-9 w-9 place-items-center rounded bg-panel text-muted hover:text-text lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={16} />
      </button>
      <StatChips />
      <div className="ml-auto flex items-center gap-2">
        <AssetSearch />
        {connected && (
          <button
            onClick={airdrop}
            title="Request 1 devnet SOL to pay for on-chain receipts"
            aria-label="Request devnet SOL airdrop"
            className="cursor-pointer grid h-9 w-9 place-items-center rounded bg-panel text-muted transition-colors hover:text-text"
          >
            <Droplets size={15} />
          </button>
        )}
        <NearButton />
        <WalletMultiButton />
      </div>
    </header>
  );
}

function StatChips() {
  const markets = useMarket((s) => s.markets);
  const volume = ASSETS.reduce((t, a) => t + markets[a.id].volume24h, 0);
  const avgEpi = ASSETS.reduce((t, a) => t + markets[a.id].epi, 0) / ASSETS.length;
  const avgChg = ASSETS.reduce((t, a) => t + change24h(markets[a.id]), 0) / ASSETS.length;
  const chips: [string, ReactNode][] = [
    ["Market", <Change key="c" value={avgChg} />],
    ["24h Vol", <span key="v" className="num">{compactUsd(volume)}</span>],
    ["Avg EPI", <span key="e" className="num">{avgEpi.toFixed(1)}</span>],
    [
      "Network",
      <span key="n" className="flex items-center gap-1.5">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" />
        Devnet
      </span>,
    ],
  ];
  return (
    <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden md:flex">
      {chips.map(([k, v], i) => (
        <div
          key={k}
          className={clsx(
            "h-9 shrink-0 items-center gap-2 rounded bg-panel px-3 text-[12px]",
            i >= 2 ? "hidden xl:flex" : "flex",
          )}
        >
          <span className="text-muted">{k}</span>
          <span className="text-text">{v}</span>
        </div>
      ))}
    </div>
  );
}

function AssetSearch() {
  const router = useRouter();
  const markets = useMarket((s) => s.markets);
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
  const results = ASSETS.filter(
    (a) => !term || a.title.toLowerCase().includes(term) || a.ticker.toLowerCase().includes(term),
  ).slice(0, 6);

  const go = (id: string) => {
    router.push(`/asset/${id}`);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="relative hidden sm:block">
      <div className="flex h-9 w-56 items-center gap-2 rounded bg-panel px-3 text-muted ring-1 ring-transparent focus-within:ring-line-2 xl:w-64">
        <Search size={14} className="shrink-0" />
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
              go(results[hi].id);
            } else if (e.key === "Escape") {
              input.current?.blur();
            }
          }}
          placeholder="Search titles…"
          aria-label="Search titles"
          role="combobox"
          aria-expanded={open}
          aria-controls="asset-search-list"
          aria-activedescendant={open && results[hi] ? `search-opt-${results[hi].id}` : undefined}
          className="w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
        />
        <kbd className="rounded-sm bg-panel-2 px-1.5 py-0.5 text-[11px] text-faint">⌘K</kbd>
      </div>
      {open && results.length > 0 && (
        <ul
          id="asset-search-list"
          role="listbox"
          className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded border border-line-2 bg-panel p-0.5"
        >
          {results.map((a, i) => (
            <li
              key={a.id}
              id={`search-opt-${a.id}`}
              role="option"
              aria-selected={i === hi}
              // mousedown (not click) so the input's blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                go(a.id);
              }}
              onMouseEnter={() => setHi(i)}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5",
                i === hi && "bg-panel-2",
              )}
            >
              <Poster asset={a} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{a.title}</span>
                <span className="block text-[11.5px] text-muted">{a.ticker}</span>
              </span>
              <span className="text-right">
                <span className="num block text-[12.5px]">{usd(priceOf(markets[a.id]))}</span>
                <Change value={change24h(markets[a.id])} className="text-[11px]" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NearButton() {
  const { accountId, ready, connect, disconnect } = useNear();
  if (accountId) {
    return (
      <div className="flex h-9 items-center gap-2 rounded bg-panel pl-3 pr-0.5 text-[12.5px] font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-near" />
        <span className="max-w-[140px] truncate">{accountId}</span>
        <button
          onClick={disconnect}
          className="cursor-pointer grid h-8 w-8 place-items-center rounded-sm text-muted hover:bg-panel-2 hover:text-text"
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
      className="cursor-pointer flex h-9 items-center gap-2 rounded bg-panel px-3 text-[12.5px] font-medium transition-colors hover:bg-panel-2 disabled:opacity-50"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-near" />
      <span className="hidden sm:inline">Connect NEAR</span>
      <span className="sm:hidden">NEAR</span>
    </button>
  );
}
