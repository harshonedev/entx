"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useMarket } from "@/store/market";

export function PriceChart({ assetId, height = 380 }: { assetId: string; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastLen = useRef(0);
  const candles = useMarket((s) => s.candles[assetId]);

  useEffect(() => {
    if (!el.current) return;
    const css = getComputedStyle(el.current);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const c = createChart(el.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: token("--muted"),
        fontFamily: token("--font-geist-sans") || "system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: { borderColor: token("--line") },
      timeScale: { borderColor: token("--line"), timeVisible: true, secondsVisible: true, rightOffset: 4 },
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
    lastLen.current = 0;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, [assetId, height]);

  useEffect(() => {
    const s = series.current;
    if (!s || !candles?.length) return;
    const data = candles.map((k) => ({ ...k, time: k.time as UTCTimestamp }));
    if (lastLen.current === 0 || Math.abs(candles.length - lastLen.current) > 1) {
      s.setData(data);
      chart.current?.timeScale().fitContent();
    } else {
      s.update(data[data.length - 1]);
    }
    lastLen.current = candles.length;
  }, [candles]);

  return <div ref={el} className="w-full" style={{ height }} />;
}
