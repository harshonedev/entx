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
    const c = createChart(el.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b919b",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      rightPriceScale: { borderColor: "#1d2128" },
      timeScale: { borderColor: "#1d2128", timeVisible: true, secondsVisible: true, rightOffset: 4 },
      crosshair: { mode: 1 },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#f87171",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
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
