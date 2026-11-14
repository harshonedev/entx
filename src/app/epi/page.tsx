"use client";

import Link from "next/link";
import { Database } from "lucide-react";
import { ASSETS, EPI_LABELS, EPI_WEIGHTS, type EpiParts } from "@/lib/assets";
import { useMarket } from "@/store/market";
import { Poster } from "@/components/poster";
import { Change, SimBadge, Sparkline } from "@/components/ui";

const KEYS = Object.keys(EPI_WEIGHTS) as (keyof EpiParts)[];

const SOURCES = [
  { name: "Box office & ratings", feed: "Studio reports, theatrical trackers", cadence: "Daily" },
  { name: "Streaming demand", feed: "Platform top-10 charts, hours viewed", cadence: "Weekly" },
  { name: "Social buzz", feed: "Trailer views, mentions, search interest", cadence: "Hourly" },
  { name: "Critic score", feed: "Aggregated review scores", cadence: "On publish" },
  { name: "Metadata", feed: "TMDB (titles, cast, release dates)", cadence: "On change" },
];

export default function EpiPage() {
  const markets = useMarket((s) => s.markets);
  const ranked = [...ASSETS].sort((a, b) => markets[b.id].epi - markets[a.id].epi);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Entertainment Popularity Index</h1>
          <SimBadge>Simulated data</SimBadge>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One 0–100 score per title, blended from four signal families. The EPI is the oracle input that
          moves ENTX markets — when it changes, traders reprice.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="py-2.5 pl-4 font-medium">#</th>
                <th className="py-2.5 font-medium">Title</th>
                <th className="py-2.5 text-right font-medium">EPI</th>
                <th className="py-2.5 text-right font-medium">24h</th>
                {KEYS.map((k) => (
                  <th key={k} className="hidden py-2.5 pl-4 font-medium md:table-cell">
                    {k === "boxOffice" ? "Box off." : EPI_LABELS[k].split(" ")[0]}
                  </th>
                ))}
                <th className="py-2.5 text-right font-medium">Conf.</th>
                <th className="py-2.5 pr-4 text-right font-medium">History</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((a, i) => {
                const m = markets[a.id];
                const hist = m.epiHistory;
                const ref = hist[Math.max(0, hist.length - 25)]?.value ?? m.epi;
                return (
                  <tr key={a.id} className="border-t border-line hover:bg-white/[0.02]">
                    <td className="num py-2.5 pl-4 text-muted">{i + 1}</td>
                    <td className="py-2.5">
                      <Link href={`/asset/${a.id}`} className="flex items-center gap-3 hover:text-accent">
                        <Poster asset={a} size="sm" />
                        <div>
                          <div className="font-medium">{a.title}</div>
                          <div className="text-xs text-muted">{a.ticker}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="num py-2.5 text-right text-base font-bold text-accent">{m.epi.toFixed(1)}</td>
                    <td className="py-2.5 text-right text-xs">
                      <Change value={m.epi / ref - 1} />
                    </td>
                    {KEYS.map((k) => (
                      <td key={k} className="hidden py-2.5 pl-4 md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-12 overflow-hidden rounded-full bg-white/5">
                            <div className="h-full bg-accent/70" style={{ width: `${m.epiParts[k]}%` }} />
                          </div>
                          <span className="num text-xs text-muted">{m.epiParts[k].toFixed(0)}</span>
                        </div>
                      </td>
                    ))}
                    <td className="num py-2.5 text-right text-xs text-muted">{a.confidence}%</td>
                    <td className="py-2.5 pr-4">
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
            <div className="label">Methodology</div>
            <div className="num mt-3 rounded-lg bg-bg p-3 text-[12px] leading-relaxed text-muted">
              EPI = {KEYS.map((k, i) => (
                <span key={k}>
                  <span className="text-accent">{EPI_WEIGHTS[k].toFixed(2)}</span>·{k}
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
              <Database size={14} className="text-accent" />
              <span className="label">Data sources</span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {SOURCES.map((s) => (
                <li key={s.name} className="text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-faint">{s.cadence}</span>
                  </div>
                  <div className="text-muted">{s.feed}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-[11px] text-faint">
              In this demo, signals are seeded and updated by the oracle controls on each asset page.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
