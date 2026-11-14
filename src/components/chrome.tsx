"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { ASSETS, ASSET_BY_ID } from "@/lib/assets";
import { change24h, priceOf, useMarket } from "@/store/market";
import { timeAgo, usd } from "@/lib/format";
import { Change, Flash, SimBadge } from "./ui";

/**
 * Static price strip: scrolls only when the user scrolls it; prices flash on change.
 * Keyboard: one Tab stop for the whole strip (roving tabindex), arrow keys / Home / End move between titles.
 */
export function TickerTape() {
  const markets = useMarket((s) => s.markets);
  const [active, setActive] = useState(0);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  // The board on /markets already lists every price; the strip would only repeat it there.
  const onBoard = usePathname() === "/markets";

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = ASSETS.length - 1;
    const next =
      e.key === "ArrowRight" ? Math.min(active + 1, last)
      : e.key === "ArrowLeft" ? Math.max(active - 1, 0)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    links.current[next]?.focus();
  };

  if (onBoard) return null;

  return (
    <nav aria-label="Market prices" aria-describedby="ticker-hint" className="w-full border-b border-line bg-panel">
      <span id="ticker-hint" className="sr-only">
        Use the left and right arrow keys to move between titles.
      </span>
      <ul
        onKeyDown={onKeyDown}
        className="flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* The header's Simulated badge is desktop-only; on phones the ticker carries it. */}
        <li className="flex shrink-0 items-center border-r border-line px-4 md:hidden">
          <SimBadge />
        </li>
        {ASSETS.map((a, i) => {
          const price = priceOf(markets[a.id]);
          return (
            <li key={a.id} className="shrink-0">
              <Link
                ref={(el) => {
                  links.current[i] = el;
                }}
                href={`/asset/${a.id}`}
                tabIndex={i === active ? 0 : -1}
                onFocus={() => setActive(i)}
                title={a.title}
                // Inset ring: the strip's overflow clip would cut an outside outline.
                className="cursor-pointer relative flex h-9 items-center gap-2 whitespace-nowrap border-r border-line px-4 text-[12px] transition-colors hover:bg-panel-2 focus-visible:outline-offset-[-2px]"
              >
                <span className="cond text-[14px] font-bold tracking-[0.04em]">{a.ticker}</span>
                <span className="sr-only max-w-[16ch] truncate whitespace-nowrap text-muted sm:not-sr-only sm:inline-block">{a.title}</span>
                <Flash value={price} className="num text-muted">
                  {usd(price)}
                </Flash>
                <Change value={change24h(markets[a.id])} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Toasts() {
  const toasts = useMarket((s) => s.toasts);
  const dismiss = useMarket((s) => s.dismissToast);
  return (
    <div
      role="status"
      aria-live="polite"
      data-toasts
      // Below xl, pages with a ticket carry a fixed jump bar (~85px) at the bottom: toasts sit above it, clear of the
      // home indicator, and phones show only the two newest so a burst doesn't bury the page.
      className="pointer-events-none fixed inset-x-4 bottom-[calc(100px+env(safe-area-inset-bottom))] z-50 flex flex-col gap-2 max-sm:[&>*:nth-last-child(n+3)]:hidden sm:inset-x-auto sm:left-1/2 sm:w-[380px] sm:-translate-x-1/2 xl:bottom-6"
    >
      {toasts.map((t) => {
        const body = (
          <>
            <div className="flex items-start gap-2">
              <span
                className={clsx(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  t.tone === "up" ? "bg-up" : t.tone === "down" ? "bg-down" : "bg-sol",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.body && <div className="mt-0.5 text-xs leading-relaxed text-muted">{t.body}</div>}
              </div>
            </div>
          </>
        );
        const external = t.href?.startsWith("http");
        return (
          <div key={t.id} className="toast-in pointer-events-auto relative border-2 border-ink bg-panel p-3 pr-8 shadow-lift">
            {t.href ? (
              external ? (
                <a href={t.href} target="_blank" rel="noreferrer" className="cursor-pointer block">{body}</a>
              ) : (
                <Link href={t.href} className="cursor-pointer block">{body}</Link>
              )
            ) : (
              body
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="cursor-pointer absolute right-2 top-2 text-faint hover:text-text"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function LiveFeed({
  refId,
  refIds,
  limit = 12,
  className,
  empty = "No activity yet. Place a trade, or open Simulate to push a news event.",
}: {
  refId?: string;
  /** Show items for any of these ids (e.g. a prediction market plus its linked title). */
  refIds?: string[];
  limit?: number;
  className?: string;
  empty?: string;
}) {
  const feed = useMarket((s) => s.feed);
  const ids = refIds ?? (refId ? [refId] : null);
  const items = (ids ? feed.filter((f) => f.refId && ids.includes(f.refId)) : feed).slice(0, limit);
  return (
    <div className={className}>
      {items.length === 0 ? (
        <p className="py-4 text-xs leading-relaxed text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((f) => (
            <li key={f.id} className="flex gap-2.5 py-2 text-xs">
              <span
                className={clsx(
                  "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                  f.type === "oracle" ? "bg-accent" : f.type === "chain" ? "bg-near" : f.tone === "up" ? "bg-up" : f.tone === "down" ? "bg-down" : "bg-muted",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className={clsx("leading-snug", f.type === "oracle" ? "text-text" : "text-muted")}>
                  {f.href ? (
                    <a href={f.href} target="_blank" rel="noreferrer" className="cursor-pointer text-near hover:underline">{f.text} ↗</a>
                  ) : f.refId && ASSET_BY_ID[f.refId] && !ids ? (
                    <Link href={`/asset/${f.refId}`} className="cursor-pointer hover:text-accent">{f.text}</Link>
                  ) : (
                    f.text
                  )}
                </div>
                <div className="mt-0.5 text-xs text-faint">{timeAgo(f.ts)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
