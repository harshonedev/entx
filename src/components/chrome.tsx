"use client";

import Link from "next/link";
import clsx from "clsx";
import { X } from "lucide-react";
import { ASSETS, ASSET_BY_ID } from "@/lib/assets";
import { change24h, priceOf, useMarket } from "@/store/market";
import { timeAgo, usd } from "@/lib/format";
import { Change } from "./ui";

export function TickerTape() {
  const markets = useMarket((s) => s.markets);
  const row = (suffix: string) => ASSETS.map((a) => (
    <Link
      key={a.id + suffix}
      aria-hidden={suffix ? true : undefined}
      tabIndex={suffix ? -1 : undefined}
      href={`/asset/${a.id}`}
      className="flex items-center gap-2 px-5 text-xs hover:text-accent"
    >
      <span className="font-semibold">{a.ticker}</span>
      <span className="num text-muted">{usd(priceOf(markets[a.id]))}</span>
      <Change value={change24h(markets[a.id])} />
    </Link>
  ));
  return (
    <div className="overflow-hidden border-b border-line bg-panel/60 py-2">
      <div className="marquee flex w-max">
        {row("")}
        {row("-dup")}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useMarket((s) => s.toasts);
  const dismiss = useMarket((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((t) => {
        const body = (
          <>
            <div className="flex items-start gap-2">
              <span
                className={clsx(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
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
          <div key={t.id} className="toast-in pointer-events-auto relative rounded-xl border border-line-2 bg-panel-2 p-3 pr-8 shadow-2xl shadow-black/50">
            {t.href ? (
              external ? (
                <a href={t.href} target="_blank" rel="noreferrer" className="block">{body}</a>
              ) : (
                <Link href={t.href} className="block">{body}</Link>
              )
            ) : (
              body
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="absolute right-2 top-2 text-faint hover:text-text"
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

export function LiveFeed({ refId, limit = 12, className }: { refId?: string; limit?: number; className?: string }) {
  const feed = useMarket((s) => s.feed);
  const items = (refId ? feed.filter((f) => f.refId === refId) : feed).slice(0, limit);
  return (
    <div className={className}>
      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-faint">
          No activity yet — push an oracle update or place a trade.
        </div>
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
                    <a href={f.href} target="_blank" rel="noreferrer" className="text-near hover:underline">{f.text} ↗</a>
                  ) : f.refId && ASSET_BY_ID[f.refId] && !refId ? (
                    <Link href={`/asset/${f.refId}`} className="hover:text-accent">{f.text}</Link>
                  ) : (
                    f.text
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-faint">{timeAgo(f.ts)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
