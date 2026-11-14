"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { ASSET_BY_ID } from "@/lib/assets";
import type { PredictionSeed } from "@/lib/predictions";
import { useProbHistory } from "@/lib/prediction-history";
import { useMarket } from "@/store/market";

/** Smallest visible span in percentage points, so a quiet market doesn't look like it's swinging wildly. */
const MIN_SPAN = 12;

type Range = { priceRange: { minValue: number; maxValue: number } } | null;
const autoscale = (original: () => Range): Range => {
  const r = original();
  if (!r) return r;
  let { minValue, maxValue } = r.priceRange;
  const mid = (minValue + maxValue) / 2;
  if (maxValue - minValue < MIN_SPAN) {
    minValue = mid - MIN_SPAN / 2;
    maxValue = mid + MIN_SPAN / 2;
  }
  return { priceRange: { minValue: Math.max(0, minValue), maxValue: Math.min(100, maxValue) } };
};
const pctFormat = { type: "custom" as const, formatter: (v: number) => `${v.toFixed(1)}%`, minMove: 0.1 };

export function ProbabilityChart({ p, height = 340 }: { p: PredictionSeed; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const modelSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const colors = useRef({ up: "#1d7446", down: "#c4221b", text: "#141414" });
  const lastLen = useRef(0);
  const history = useProbHistory(p.id);
  const feed = useMarket((s) => s.feed);

  // News on the linked title (direction = effect on YES, not on the title) and your own bets.
  // Markers sit on the recorded (live) line, so only events from its start onward are drawn.
  const events = useMemo(() => {
    const firstReal = history.find((h) => !h.modelled);
    if (!firstReal) return [];
    const first = firstReal.time;
    return feed
      .filter(
        (f) =>
          (p.assetId && f.refId === p.assetId && f.type === "oracle") || (f.refId === p.id && f.type === "trade"),
      )
      .map((f) => {
        const news = f.type === "oracle";
        const good = f.tone === "up";
        return {
          time: Math.floor(f.ts / 1000),
          news,
          yesUp: news ? (good ? p.sensitivity > 0 : p.sensitivity < 0) : good,
          text: news ? (f.tag ?? "") : "",
        };
      })
      .filter((e) => e.time >= first)
      .sort((x, y) => x.time - y.time);
  }, [feed, history, p.assetId, p.id, p.sensitivity]);

  useEffect(() => {
    if (!el.current) return;
    const css = getComputedStyle(el.current);
    const token = (name: string) => css.getPropertyValue(name).trim();
    colors.current = { up: token("--up"), down: token("--down"), text: token("--text") };
    const c = createChart(el.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: token("--muted"),
        fontFamily: token("--font-ui") || "system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(20,20,20,0.07)" },
      },
      // Thin margins, and no axis label outside 0–100%, so a settled market never shows "110%".
      rightPriceScale: { borderColor: token("--line"), scaleMargins: { top: 0.06, bottom: 0.06 } },
      // Room on the right so the "Live" marker and the newest point never touch the price scale.
      timeScale: { borderColor: token("--line"), timeVisible: true, secondsVisible: false, rightOffset: 12 },
      crosshair: { mode: 0 },
      // Whole-percent ticks collide on narrow ranges (37.5 and 38 both read "38%"), so keep the half.
      localization: {
        priceFormatter: (v: number) =>
          v > 100.0001 || v < -0.0001 ? "" : `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`,
      },
    });
    // Live (recorded) line in full color; added first so it owns the markers and the last-value label.
    const s = c.addSeries(LineSeries, {
      color: token("--up"),
      lineWidth: 2,
      priceLineColor: token("--line-2"),
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: pctFormat,
      autoscaleInfoProvider: autoscale,
    });
    // Modelled lead-in: thin, dashed and grey so it never reads as traded prices.
    const ms = c.addSeries(LineSeries, {
      color: token("--faint"),
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerRadius: 3,
      priceFormat: pctFormat,
      autoscaleInfoProvider: autoscale,
    });
    chart.current = c;
    series.current = s;
    modelSeries.current = ms;
    markersApi.current = createSeriesMarkers(s, []);
    lastLen.current = 0;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      modelSeries.current = null;
      markersApi.current = null;
    };
  }, [height]);

  useEffect(() => {
    const s = series.current;
    if (!s || !history.length) return;
    const pt = (h: (typeof history)[number]) => ({ time: h.time as UTCTimestamp, value: h.value * 100 });
    const real = history.filter((h) => !h.modelled).map(pt);
    if (lastLen.current === 0 || Math.abs(history.length - lastLen.current) > 1) {
      const model = history.filter((h) => h.modelled).map(pt);
      // The dashed lead-in runs into the first recorded point so the two lines join.
      modelSeries.current?.setData(model.length && real.length ? [...model, real[0]] : model);
      s.setData(real);
      chart.current?.timeScale().fitContent();
    } else if (real.length) {
      s.update(real[real.length - 1]);
    }
    lastLen.current = history.length;
  }, [history]);

  useEffect(() => {
    const { up, down, text } = colors.current;
    // Markers must sit on a time the series has; snap each event to the nearest earlier point.
    const times = history.map((h) => h.time);
    const snap = (t: number) => {
      let lo = 0;
      let hi = times.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      return times[lo];
    };
    const firstReal = history.find((h) => !h.modelled);
    const boundary: SeriesMarker<Time>[] =
      firstReal && history[0]?.modelled
        ? [{ time: firstReal.time as UTCTimestamp, position: "belowBar", shape: "square", color: text, text: "Live", size: 0.5 }]
        : [];
    const markers: SeriesMarker<Time>[] = [...boundary, ...events.map((e) => ({
      time: snap(e.time) as UTCTimestamp,
      position: e.yesUp ? "belowBar" : "aboveBar",
      shape: e.news ? (e.yesUp ? "arrowUp" : "arrowDown") : "circle",
      color: e.news ? (e.yesUp ? up : down) : text,
      text: e.text,
      size: e.news ? 1 : 0.6,
    }) as SeriesMarker<Time>)].sort((a, b) => (a.time as number) - (b.time as number));
    markersApi.current?.setMarkers(markers);
  }, [events, history]);

  const news = events.filter((e) => e.news).length;
  const modelled = history[0]?.modelled === true;
  const ticker = p.assetId ? ASSET_BY_ID[p.assetId]?.ticker : undefined;
  return (
    <div>
      <div
        ref={el}
        role="img"
        aria-label={`Chance of YES over time.${
          modelled
            ? ` The dashed grey stretch before the "Live" mark is modelled${ticker ? ` from ${ticker}'s EPI` : ""}, not traded prices.`
            : ""
        }${news ? ` ${news} news event${news === 1 ? "" : "s"} marked.` : ""}`}
        className="w-full"
        style={{ height }}
      />
      {modelled && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t border-dashed border-faint" />
            Modelled{ticker ? ` from ${ticker}'s EPI` : ""}, simulated, not traded
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-up" />
            Live, recorded in this browser
          </span>
        </div>
      )}
    </div>
  );
}
