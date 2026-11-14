"use client";

import { useTheme } from "@/lib/theme";
import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { CANDLE_SECONDS, type Candle } from "@/lib/engine";
import { fairValue, useMarket } from "@/store/market";

function chartLabel(news: number, trades: number, leadIn: boolean) {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const lead = leadIn ? " Earlier candles are a modelled lead-in; a marker shows where live data starts." : "";
  if (!news && !trades) return `Price chart with the EPI-implied price as a dashed line. No news events or trades in this window yet.${lead}`;
  return `Price chart with the EPI-implied price as a dashed line. Marked: ${n(news, "news event", "news events")}, ${n(trades, "of your trades", "of your trades")}.${lead}`;
}

/** Merge consecutive candles into `step`-second buckets. */
function aggregate(list: Candle[], step: number): Candle[] {
  if (step <= CANDLE_SECONDS) return list;
  const out: Candle[] = [];
  for (const k of list) {
    const t = Math.floor(k.time / step) * step;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, k.high);
      last.low = Math.min(last.low, k.low);
      last.close = k.close;
      // A bucket with any recorded candle counts as recorded.
      if (!k.modelled) delete last.modelled;
    } else out.push({ ...k, time: t });
  }
  return out;
}

export function PriceChart({
  assetId,
  height = 380,
  step = CANDLE_SECONDS,
}: {
  assetId: string;
  height?: number;
  /** Candle width in seconds; must be a multiple of CANDLE_SECONDS. */
  step?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // Canvas can't resolve CSS variables, so token colours are read once at mount.
  const colors = useRef({ up: "#1d7446", down: "#c4221b", text: "#141414" });
  const lastLen = useRef(0);
  // Canvas colours are read from tokens, so the chart is rebuilt when the edition changes.
  const theme = useTheme();
  const raw = useMarket((s) => s.candles[assetId]);
  const feed = useMarket((s) => s.feed);
  // Rounded so the line only moves when the EPI does, not on every tick.
  const fair = useMarket((s) => Math.round(fairValue(assetId, s.markets[assetId]) * 100) / 100);
  const fairLine = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const candles = useMemo(() => (raw ? aggregate(raw, step) : raw), [raw, step]);

  // News and your own trades, pinned to the candle they landed in.
  const events = useMemo(() => {
    if (!candles?.length) return [];
    const first = candles[0].time;
    return feed
      .filter((f) => f.refId === assetId && (f.type === "oracle" || f.type === "trade"))
      .map((f) => ({
        time: Math.floor(f.ts / 1000 / step) * step,
        news: f.type === "oracle",
        up: f.tone === "up",
        // Older persisted events have no short tag; show just the arrow rather than a long overlapping sentence.
        text: f.type === "oracle" ? (f.tag ?? "") : "",
      }))
      .filter((e) => e.time >= first)
      .sort((x, y) => x.time - y.time);
  }, [feed, candles, assetId, step]);

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
        vertLines: { color: token("--grid") },
        horzLines: { color: token("--grid") },
      },
      rightPriceScale: { borderColor: token("--line") },
      timeScale: { borderColor: token("--line"), timeVisible: true, secondsVisible: step < 60, rightOffset: 12 },
      crosshair: { mode: 1 },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: token("--up"),
      downColor: token("--down"),
      borderVisible: false,
      wickUpColor: token("--up"),
      wickDownColor: token("--down"),
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chart.current = c;
    series.current = s;
    markersApi.current = createSeriesMarkers(s, []);
    lastLen.current = 0;
    fairLine.current = null;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      markersApi.current = null;
    };
  }, [assetId, height, step, theme]);

  // Dashed line at the price the EPI supports, so the anchor behind every move is visible.
  useEffect(() => {
    const s = series.current;
    if (!s?.createPriceLine) return;
    const opts = { price: fair, color: colors.current.text, lineWidth: 1 as const, lineStyle: 2, axisLabelVisible: true, title: "EPI-implied price" };
    if (fairLine.current) fairLine.current.applyOptions(opts);
    else fairLine.current = s.createPriceLine(opts);
  }, [fair, assetId, height, step, theme]);

  useEffect(() => {
    const s = series.current;
    if (!s || !candles?.length) return;
    // Generated lead-in draws muted, so only recorded candles carry the up/down colours.
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--line-2").trim() || "#bdb5a4";
    // lightweight-charts rejects out-of-order or duplicate times (a persisted history meeting a fresh lead-in,
    // or a throttled background tab firing ticks late), so keep strictly ascending times, last candle wins.
    const byTime = new Map<number, (typeof candles)[number]>();
    for (const k of candles) byTime.set(k.time, k);
    const data = [...byTime.values()]
      .sort((a, b) => a.time - b.time)
      .map(({ modelled, ...k }) => ({
        ...k,
        time: k.time as UTCTimestamp,
        ...(modelled ? { color: muted, wickColor: muted, borderColor: muted } : {}),
      }));
    try {
      if (lastLen.current === 0 || Math.abs(candles.length - lastLen.current) > 1) {
        s.setData(data);
        chart.current?.timeScale().fitContent();
      } else {
        s.update(data[data.length - 1]);
      }
    } catch {
      // An update older than the last drawn bar: redraw the whole series instead of crashing the page.
      s.setData(data);
    }
    lastLen.current = candles.length;
  }, [candles, theme]);

  useEffect(() => {
    const { up, down, text } = colors.current;
    const markers: SeriesMarker<Time>[] = events.map((e) =>
      e.news
        ? {
            time: e.time as UTCTimestamp,
            position: e.up ? "belowBar" : "aboveBar",
            shape: e.up ? "arrowUp" : "arrowDown",
            color: e.up ? up : down,
            text: e.text,
          }
        : {
            time: e.time as UTCTimestamp,
            position: e.up ? "belowBar" : "aboveBar",
            shape: "circle",
            color: text,
            text: e.text,
            size: 0.6,
          },
    );
    // Mark where recorded history starts, when a generated lead-in precedes it.
    const firstReal = candles?.find((k) => !k.modelled);
    if (firstReal && candles?.[0]?.modelled) {
      markers.push({ time: firstReal.time as UTCTimestamp, position: "belowBar", shape: "square", color: text, text: "Live from here", size: 0.5 });
      markers.sort((a, b) => (a.time as number) - (b.time as number));
    }
    markersApi.current?.setMarkers(markers);
  }, [events, candles, theme]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={chartLabel(
        events.filter((e) => e.news).length,
        events.filter((e) => !e.news).length,
        !!candles?.[0]?.modelled && !!candles.some((k) => !k.modelled),
      )}
      className="w-full"
      style={{ height }}
    />
  );
}
