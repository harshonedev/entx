"use client";

import Link from "next/link";
import { Database } from "lucide-react";
import { ASSETS, EPI_LABELS, EPI_WEIGHTS, type EpiParts } from "@/lib/assets";
import { useMarket } from "@/store/market";
import { Poster } from "@/components/poster";
import { Change, SimBadge, Sparkline } from "@/components/ui";

const KEYS = Object.keys(EPI_WEIGHTS) as (keyof EpiParts)[];

const SHORT: Record<keyof EpiParts, string> = {
  boxOffice: "box office",
  streaming: "streaming",
  social: "social",
  critics: "rating",
};

/**
 * Where each signal comes from in this demo (`now`, `detail`) and the feed it is modelled on for
 * production (`model`). Every number is seeded from TMDB (scripts/seed-tmdb.ts); after that, only
 * simulated news events move it.
 */
const SOURCES = [
  {
    name: "Box office",
    now: "TMDB seed",
    detail: "Worldwide revenue; budget for unreleased films, vote count for shows",
    model: "Studio reports, theatrical trackers",
  },
  {
    name: "Streaming demand",
    now: "TMDB seed",
    detail: "TMDB popularity, ranked within the catalogue",
    model: "Platform top-10 charts, hours viewed",
  },
  {
    name: "Social buzz",
    now: "TMDB seed",
    detail: "TMDB vote count",
    model: "Trailer views, mentions, search interest",
  },
  { name: "Audience rating", now: "TMDB seed", detail: "TMDB audience vote average", model: null },
  { name: "Metadata", now: "TMDB", detail: "TMDB (titles, cast, release dates)", model: null },
];

export default function EpiPage() {
  const markets = useMarket((s) => s.markets);
  const ranked = [...ASSETS].sort((a, b) => markets[b.id].epi - markets[a.id].epi);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Entertainment Popularity Index</h1>
          <SimBadge>TMDB inputs · simulated updates</SimBadge>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One 0–100 score per title, blended from four signal families. The EPI is the oracle input that
          moves ENTX markets — when it changes, traders reprice.
        </p>
      </div>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="w-12 py-2.5 pl-4 font-medium">#</th>
                <th className="min-w-[200px] py-2.5 pr-4 font-medium">Title</th>
                <th className="py-2.5 pl-4 text-right font-medium">EPI</th>
                <th className="py-2.5 pl-4 text-right font-medium">24h</th>
                {KEYS.map((k) => (
                  <th key={k} className="hidden whitespace-nowrap py-2.5 pl-4 font-medium lg:table-cell">
                    {k === "boxOffice" ? "Box office" : k === "critics" ? "Rating" : EPI_LABELS[k].split(" ")[0]}
                  </th>
                ))}
                <th className="hidden py-2.5 pl-4 pr-2 text-right font-medium 2xl:table-cell">Confidence</th>
                <th className="py-2.5 pl-4 pr-4 text-right font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((a, i) => {
                const m = markets[a.id];
                const hist = m.epiHistory;
                const ref = hist[Math.max(0, hist.length - 25)]?.value ?? m.epi;
                return (
                  <tr key={a.id} className="border-t border-line hover:bg-white/[0.02]">
                    <td className="num w-12 py-2.5 pl-4 text-muted">{i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <Link href={`/asset/${a.id}`} className="cursor-pointer flex items-center gap-3 hover:text-accent">
                        <Poster asset={a} size="sm" />
                        <div className="min-w-0">
                          <div className="line-clamp-2 font-medium leading-snug">{a.title}</div>
                          <div className="text-xs text-muted">{a.ticker}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="num py-2.5 pl-4 text-right text-base font-semibold">{m.epi.toFixed(1)}</td>
                    <td className="py-2.5 pl-4 text-right text-xs">
                      <Change value={m.epi / ref - 1} />
                    </td>
                    {KEYS.map((k) => (
                      <td key={k} className="hidden py-2.5 pl-4 lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="hidden h-1 w-12 overflow-hidden bg-white/[0.06] 2xl:block">
                            <div className="h-full bg-white/60" style={{ width: `${m.epiParts[k]}%` }} />
                          </div>
                          <span className="num text-xs text-muted">{m.epiParts[k].toFixed(0)}</span>
                        </div>
                      </td>
                    ))}
                    <td className="num hidden py-2.5 pl-4 pr-2 text-right text-xs text-muted 2xl:table-cell">{a.confidence}%</td>
                    <td className="py-2.5 pl-4 pr-4">
                      <Sparkline points={hist.slice(-30).map((h) => h.value)} width={80} height={24} className="ml-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <h2 className="h-panel">Methodology</h2>
            <div className="num mt-3 rounded bg-bg p-3 text-xs leading-relaxed text-muted">
              EPI = {KEYS.map((k, i) => (
                <span key={k}>
                  <span className="text-text">{EPI_WEIGHTS[k].toFixed(2)}</span> × {SHORT[k]}
                  {i < KEYS.length - 1 ? " + " : ""}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Each signal is normalised to 0–100. Confidence reflects how many independent sources agree. A
              change in EPI shifts the market&apos;s fair-value anchor; simulated traders arbitrage price toward it.
            </p>
          </div>
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-muted" />
              <h2 className="h-panel">Data sources</h2>
            </div>
            <ul className="mt-3 space-y-2.5">
              {SOURCES.map((s) => (
                <li key={s.name} className="text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-text/80">{s.now}</span>
                  </div>
                  <div className="text-muted">{s.detail}</div>
                  {s.model && (
                    <div className="text-faint">
                      Modelled on {s.model.charAt(0).toLowerCase()}
                      {s.model.slice(1)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
              Every signal starts from TMDB data. After that, the values here move only with simulated news
              events from the Demo controls in the top bar.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
