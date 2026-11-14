"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PredictionSeed } from "@/lib/predictions";
import { useProbHistory } from "@/lib/prediction-history";
import { useMarket } from "@/store/market";

/** Smallest visible span in percentage points, so a quiet market doesn't look like it's swinging wildly. */
const MIN_SPAN = 12;

export function ProbabilityChart({ p, height = 340 }: { p: PredictionSeed; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const colors = useRef({ up: "#34c77b", down: "#ef5350", text: "#f2f2f2" });
  const lastLen = useRef(0);
  const history = useProbHistory(p.id);
  const feed = useMarket((s) => s.feed);

  // News on the linked title (direction = effect on YES, not on the title) and your own bets.
  const events = useMemo(() => {
    if (!history.length) return [];
    const first = history[0].time;
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
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: token("--line") },
      timeScale: { borderColor: token("--line"), timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: 0 },
      localization: { priceFormatter: (v: number) => `${v.toFixed(0)}%` },
    });
    const s = c.addSeries(LineSeries, {
      color: token("--up"),
      lineWidth: 2,
      priceLineColor: token("--line-2"),
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(1)}%`, minMove: 0.1 },
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = original();
        if (!r) return r;
        let { minValue, maxValue } = r.priceRange;
        const mid = (minValue + maxValue) / 2;
        if (maxValue - minValue < MIN_SPAN) {
          minValue = mid - MIN_SPAN / 2;
          maxValue = mid + MIN_SPAN / 2;
        }
        return { priceRange: { minValue: Math.max(0, minValue), maxValue: Math.min(100, maxValue) } };
      },
    });
    chart.current = c;
    series.current = s;
    markersApi.current = createSeriesMarkers(s, []);
    lastLen.current = 0;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      markersApi.current = null;
    };
  }, [height]);

  useEffect(() => {
    const s = series.current;
    if (!s || !history.length) return;
    const data = history.map((h) => ({ time: h.time as UTCTimestamp, value: h.value * 100 }));
    if (lastLen.current === 0 || Math.abs(history.length - lastLen.current) > 1) {
      s.setData(data);
      chart.current?.timeScale().fitContent();
    } else {
      s.update(data[data.length - 1]);
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
    const markers: SeriesMarker<Time>[] = events.map((e) => ({
      time: snap(e.time) as UTCTimestamp,
      position: e.yesUp ? "belowBar" : "aboveBar",
      shape: e.news ? (e.yesUp ? "arrowUp" : "arrowDown") : "circle",
      color: e.news ? (e.yesUp ? up : down) : text,
      text: e.text,
      size: e.news ? 1 : 0.6,
    }));
    markersApi.current?.setMarkers(markers);
  }, [events, history]);

  const news = events.filter((e) => e.news).length;
  return (
    <div
      ref={el}
      role="img"
      aria-label={`Chance of YES over time.${news ? ` ${news} news event${news === 1 ? "" : "s"} marked.` : ""}`}
      className="w-full"
      style={{ height }}
    />
  );
}
