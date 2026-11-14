"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { FlaskConical, TrendingDown, TrendingUp, X } from "lucide-react";
import { ASSETS, ASSET_BY_ID, EPI_SHORT_LABELS, ORACLE_EVENTS, eventsFor, type EpiParts } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { useMarket } from "@/store/market";


/**
 * Everything that bends the simulation lives here, away from Buy and the bet buttons:
 * pushing a news event through the oracle, and settling a prediction market early.
 * It stays one click away so a demo can still show news → EPI → price.
 */
export function DemoControls() {
  const path = usePathname();
  // Default to the title on screen: an asset page's own title, or a prediction market's linked title.
  const segment = path.split("/")[2];
  const routeAsset = path.startsWith("/asset/")
    ? segment
    : path.startsWith("/predictions/")
      ? PREDICTIONS.find((p) => p.id === segment)?.assetId
      : undefined;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // Settling can't be undone, so it takes a second, explicit click on the same market and outcome.
  const [arming, setArming] = useState<{ id: string; outcome: "YES" | "NO" } | null>(null);
  const [group, setGroup] = useState<"news" | "settle">("news");
  const assetId = picked ?? (routeAsset && ASSET_BY_ID[routeAsset] ? routeAsset : ASSETS[0].id);
  const asset = ASSET_BY_ID[assetId];
  const oracle = useMarket((s) => s.oracle);
  const resolve = useMarket((s) => s.resolve);
  const predictions = useMarket((s) => s.predictions);
  const momentum = useMarket((s) => s.markets[assetId]?.momentum ?? 0);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const open_markets = PREDICTIONS.filter((p) => p.assetId === assetId && !predictions[p.id]?.resolved);
  const showSettle = group === "settle" && open_markets.length > 0;
  const lift = (e: (typeof ORACLE_EVENTS)[number]) => Object.values(e.delta).reduce((t, v) => t + (v ?? 0), 0) > 0;
  const newsGroups = [
    { label: "Lifts EPI", events: eventsFor(asset).filter(lift) },
    { label: "Drops EPI", events: eventsFor(asset).filter((e) => !lift(e)) },
  ].filter((g) => g.events.length > 0);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="demo-controls"
        aria-label="Demo controls"
        className={clsx(
          "cursor-pointer flex h-9 items-center gap-2 rounded px-3 text-[12.5px] font-medium transition-colors pointer-coarse:h-11",
          open ? "bg-panel-2 text-text" : "bg-panel text-muted hover:text-text",
        )}
      >
        <FlaskConical size={14} />
        <span>Demo</span>
      </button>

      {open && (
        <div
          id="demo-controls"
          ref={panel}
          tabIndex={-1}
          role="dialog"
          aria-label="Demo controls"
          className="fixed right-4 top-[76px] z-50 max-h-[calc(100vh-92px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded border border-line-2 bg-panel-2 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.5)] outline-none"
        >
          <div className="flex items-center gap-2">
            <h2 className="h-panel">Demo controls</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close demo controls"
              className="cursor-pointer ml-auto grid h-7 w-7 place-items-center rounded text-muted hover:text-text"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Stand-ins for real-world data. Push a news event and watch the popularity index, then the price, react.
          </p>

          <label className="mt-4 block text-xs text-muted" htmlFor="demo-asset">
            Title
          </label>
          <select
            id="demo-asset"
            value={assetId}
            onChange={(e) => setPicked(e.target.value)}
            className="cursor-pointer mt-1 h-9 w-full rounded border border-line-2 bg-bg px-2 text-[13px]"
          >
            {ASSETS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.ticker})
              </option>
            ))}
          </select>

          {/* Two jobs, one visible at a time: push news (reversible, the demo's main beat) or settle (final). */}
          <div role="group" className="seg mt-4 flex w-full [&>button]:flex-1" aria-label="Demo action">
            <button type="button" className="cursor-pointer" aria-pressed={!showSettle} onClick={() => setGroup("news")}>
              News event
            </button>
            {open_markets.length > 0 && (
              <button type="button" className="cursor-pointer" aria-pressed={showSettle} onClick={() => setGroup("settle")}>
                Settle early ({open_markets.length})
              </button>
            )}
          </div>

          {!showSettle && (
            <>
              {newsGroups.map((g) => (
                <div key={g.label} role="group" aria-labelledby={`demo-${g.label.split(" ")[0].toLowerCase()}`}>
                  <h3 id={`demo-${g.label.split(" ")[0].toLowerCase()}`} className="mt-3 text-xs font-medium text-muted">
                    {g.label}
                  </h3>
                  <div className="mt-1.5 grid gap-1.5">
                    {g.events.map((e) => {
                      const positive = lift(e);
                      return (
                        <button
                          key={e.id}
                          onClick={() => oracle(assetId, e.id)}
                          className={clsx(
                            "cursor-pointer flex items-center gap-2 rounded border px-3 py-2 text-left text-[13px] transition-colors",
                            positive ? "border-up/20 hover:bg-up/[0.06]" : "border-down/20 hover:bg-down/[0.06]",
                          )}
                        >
                          {positive ? <TrendingUp size={14} className="text-up" /> : <TrendingDown size={14} className="text-down" />}
                          <span className="flex-1">{e.label}</span>
                          <span className="text-xs text-muted">
                            {Object.entries(e.delta)
                              .map(([k, v]) => `${EPI_SHORT_LABELS[k as keyof EpiParts]} ${v! > 0 ? "+" : ""}${v}`)
                              .join(" · ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Math.abs(momentum) > 0.002 && (
                <p className="mt-2 text-xs text-muted" role="status">
                  {asset.ticker} reacting: {momentum > 0 ? "buy" : "sell"} pressure {(Math.abs(momentum) * 100).toFixed(1)}%
                  left
                </p>
              )}
            </>
          )}

          {showSettle && (
            <>
              <h3 className="mt-3 text-xs font-medium text-muted">Settle a prediction early</h3>
              <ul className="mt-1.5 space-y-2">
                {open_markets.map((p) => (
                  <li key={p.id} className="text-xs">
                    <div className="leading-snug">{p.question}</div>
                    {arming?.id === p.id ? (
                      <div className="mt-1 flex items-center gap-1.5" role="group" aria-label="Confirm settlement">
                        <button
                          onClick={() => {
                            resolve(p.id, arming.outcome);
                            setArming(null);
                          }}
                          className={clsx(
                            "cursor-pointer h-8 rounded px-3 font-semibold text-black pointer-coarse:h-11",
                            arming.outcome === "YES" ? "bg-up" : "bg-down",
                          )}
                        >
                          Confirm settle {arming.outcome}
                        </button>
                        <button
                          onClick={() => setArming(null)}
                          className="cursor-pointer h-8 rounded border border-line-2 px-3 pointer-coarse:h-11"
                        >
                          Cancel
                        </button>
                        <span className="text-faint">Can&apos;t be undone</span>
                      </div>
                    ) : (
                      <div className="mt-1 flex gap-1.5">
                        {(["YES", "NO"] as const).map((o) => (
                          <button
                            key={o}
                            onClick={() => setArming({ id: p.id, outcome: o })}
                            className={clsx(
                              "cursor-pointer h-8 rounded border border-line-2 px-3 pointer-coarse:h-11",
                              o === "YES" ? "hover:text-up" : "hover:text-down",
                            )}
                          >
                            Settle {o}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
