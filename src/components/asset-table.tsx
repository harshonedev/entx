"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { AssetSeed } from "@/lib/assets";
import { change24h, priceOf, useMarket, type MarketState } from "@/store/market";
import { compactUsd, metricText, usd } from "@/lib/format";
import { Poster } from "./poster";
import { Change, EpiMeter, Flash, Sparkline } from "./ui";

type SortKey = "price" | "change" | "epi" | "volume";
type Dir = "asc" | "desc";
type Sort = { key: SortKey; dir: Dir } | null;

const SORT_LABEL: Record<SortKey, string> = { price: "Price", change: "24h change", epi: "EPI", volume: "Volume" };
const SORT_VALUE: Record<SortKey, (m: MarketState) => number> = {
  price: priceOf,
  change: change24h,
  epi: (m) => m.epi,
  volume: (m) => m.volume24h,
};

/** Header click cycles: high to low, low to high, back to the default order. */
const nextSort = (cur: Sort, key: SortKey): Sort =>
  cur?.key !== key ? { key, dir: "desc" } : cur.dir === "desc" ? { key, dir: "asc" } : null;

export function AssetTable({
  assets,
  showMetric = true,
  limit,
}: {
  assets: AssetSeed[];
  showMetric?: boolean;
  /** Show only the first `limit` rows, taken after sorting so a sort ranks the whole list. */
  limit?: number;
}) {
  const markets = useMarket((s) => s.markets);
  const candles = useMarket((s) => s.candles);
  const router = useRouter();
  const [sort, setSort] = useState<Sort>(null);

  let rows = assets;
  if (sort) {
    const val = SORT_VALUE[sort.key];
    const sign = sort.dir === "desc" ? -1 : 1;
    rows = [...assets].sort((a, b) => sign * (val(markets[a.id]) - val(markets[b.id])));
  }
  if (limit != null) rows = rows.slice(0, limit);

  // Sortable header: a real button inside the <th>, with aria-sort on the <th>. Right-aligned columns put the
  // arrow first so the label stays flush with the numbers below it.
  const sortTh = (k: SortKey, label: string, align: "left" | "right") => {
    const active = sort?.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === "desc" ? ArrowDown : ArrowUp;
    const icon = <Icon size={12} aria-hidden className={active ? undefined : "opacity-50"} />;
    return (
      <th
        aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
        className={clsx("py-0 font-medium", align === "right" ? "pl-4 text-right" : "pl-6")}
      >
        <button
          type="button"
          data-static
          onClick={() => setSort(nextSort(sort, k))}
          className={clsx(
            "cursor-pointer inline-flex h-8 items-center gap-1 rounded-sm uppercase tracking-wider hover:text-text",
            active && "text-text",
          )}
        >
          {align === "right" && icon}
          {label}
          {align === "left" && icon}
        </button>
      </th>
    );
  };

  return (
    <>
      {/* Phones: stacked rows, so price and change are always visible. Headers are gone, so sorting is a select. */}
      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2 sm:hidden">
        <label htmlFor="asset-sort" className="text-xs text-muted">
          Sort
        </label>
        <select
          id="asset-sort"
          value={sort ? `${sort.key}:${sort.dir}` : ""}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [SortKey, Dir];
            setSort(e.target.value ? { key, dir } : null);
          }}
          className="cursor-pointer h-11 rounded-sm border border-line-2 bg-panel-2 px-2 text-[13px] text-text"
        >
          <option value="">Default</option>
          {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
            <option key={`${k}:desc`} value={`${k}:desc`}>
              {SORT_LABEL[k]}: high to low
            </option>,
            <option key={`${k}:asc`} value={`${k}:asc`}>
              {SORT_LABEL[k]}: low to high
            </option>,
          ])}
        </select>
      </div>
      <ul className="sm:hidden">
        {rows.map((a) => {
          const m = markets[a.id];
          const price = priceOf(m);
          return (
            <li key={a.id} className="border-t border-line">
              <Link href={`/asset/${a.id}`} className="cursor-pointer flex items-center gap-3 px-4 py-2.5 active:bg-white/[0.03]">
                <Poster asset={a} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  <div className="truncate text-xs text-muted">
                    {a.ticker} · EPI <span className="num">{m.epi.toFixed(1)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-sm font-medium">
                    <Flash value={price}>{usd(price)}</Flash>
                  </div>
                  <Change value={change24h(m)} className="text-xs" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th className="py-2 pl-4 font-medium">Asset</th>
            {sortTh("price", "Price", "right")}
            {sortTh("change", "24h", "right")}
            {sortTh("epi", "EPI", "left")}
            {sortTh("volume", "Volume", "right")}
            {showMetric && <th className="hidden py-2 pl-6 font-medium lg:table-cell">Signal</th>}
            <th className="py-2 pr-4 text-right font-medium" title="Price over the last 12 minutes; the 24h column covers the full day">Last 12 min</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const m = markets[a.id];
            const price = priceOf(m);
            const closes = (candles[a.id] ?? []).slice(-48).map((c) => c.close);
            return (
              <tr
                key={a.id}
                onClick={() => router.push(`/asset/${a.id}`)}
                className="cursor-pointer border-t border-line transition-colors hover:bg-white/[0.025]"
              >
                <td className="py-2.5 pl-4">
                  <Link href={`/asset/${a.id}`} className="cursor-pointer flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <Poster asset={a} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.title}</div>
                      <div className="text-xs text-muted">
                        <span className="font-semibold text-text/80">{a.ticker}</span> · {a.kind === "movie" ? "Movie" : "Show"} · {a.status}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="num py-2.5 text-right font-medium">
                  <Flash value={price}>{usd(price)}</Flash>
                </td>
                <td className="py-2.5 pl-4 text-right text-xs">
                  <Change value={change24h(m)} />
                </td>
                <td className="hidden py-2.5 pl-6 sm:table-cell">
                  <div className="flex w-28 items-center gap-2">
                    <span className="num w-9 text-xs font-medium">{m.epi.toFixed(1)}</span>
                    <EpiMeter value={m.epi} />
                  </div>
                </td>
                <td className="num py-2.5 text-right text-xs text-muted">{compactUsd(m.volume24h)}</td>
                {showMetric && (
                  <td className="hidden py-2.5 pl-6 text-xs text-muted lg:table-cell">
                    <span className="text-faint">{a.metric.label}</span>{" "}
                    <span className="num text-text/80">{metricText({ value: m.metricValue, unit: a.metric.unit })}</span>
                  </td>
                )}
                <td className="py-2.5 pr-4">
                  <Sparkline points={closes} className="ml-auto" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
