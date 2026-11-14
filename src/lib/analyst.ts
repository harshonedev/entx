// ENTX Analyst: transparent, rule-based trading signals.
// It explains *why* — every factor and weight is shown — and it only recommends; it never trades.

import { ASSET_BY_ID, computeEpi } from "./assets";
import { PREDICTIONS } from "./predictions";
import { poolPrice, yesPrice, type Candle } from "./engine";
import type { MarketState, PredictionState } from "@/store/market";

export type Rating = "Strong buy" | "Buy" | "Hold" | "Sell" | "Strong sell";

export interface Factor {
  name: string;
  value: string;
  score: number; // -1..1
  weight: number;
  why: string;
}

export interface Signal {
  rating: Rating;
  score: number; // -1..1
  fairValue: number;
  upside: number;
  confidence: number; // 0..100
  factors: Factor[];
  summary: string;
}

const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export function analyze(
  assetId: string,
  m: MarketState,
  candles: Candle[] | undefined,
  predictions: Record<string, PredictionState>,
): Signal {
  const a = ASSET_BY_ID[assetId];
  const price = poolPrice(m.pool);
  const epi0 = computeEpi(a.epiParts);

  // 1. Fundamental gap: where price "should" be given the EPI move (same 2.6x elasticity the market uses).
  const fairValue = a.basePrice * Math.max(0.2, 1 + (m.epi / epi0 - 1) * 2.6);
  const gap = fairValue / price - 1;

  // 2. Short-term momentum: last close vs 20-candle average.
  const closes = (candles ?? []).slice(-20).map((c) => c.close);
  const avg = closes.length ? closes.reduce((t, c) => t + c, 0) / closes.length : price;
  const mom = price / avg - 1;

  // 3. Popularity trend: EPI now vs ~24 samples ago.
  const hist = m.epiHistory;
  const ref = hist[Math.max(0, hist.length - 25)]?.value ?? m.epi;
  const epiTrend = m.epi / ref - 1;

  // 4. Crowd: linked prediction markets (sensitivity-adjusted YES odds above/below 50%).
  const linked = PREDICTIONS.filter((p) => p.assetId === assetId && !predictions[p.id]?.resolved);
  const crowd = linked.length
    ? linked.reduce((t, p) => t + p.sensitivity * (yesPrice(predictions[p.id].pool) - 0.5), 0) / linked.length
    : 0;

  const factors: Factor[] = [
    {
      name: "Fundamental gap",
      value: pct(gap),
      score: clamp(gap * 8),
      weight: 0.45,
      why:
        gap > 0.02
          ? `EPI implies ${pct(gap)} upside to fair value — price hasn't caught up with popularity.`
          : gap < -0.02
            ? `Price runs ${pct(-gap)} ahead of what the EPI supports.`
            : "Price is in line with popularity-implied fair value.",
    },
    {
      name: "EPI trend",
      value: pct(epiTrend),
      score: clamp(epiTrend * 12),
      weight: 0.25,
      why: `Popularity index ${epiTrend >= 0 ? "rose" : "fell"} ${pct(Math.abs(epiTrend)).slice(1)} over the recent window.`,
    },
    {
      name: "Price momentum",
      value: pct(mom),
      score: clamp(mom * 25),
      weight: 0.15,
      why: `Last price vs 20-candle average. ${Math.abs(mom) < 0.005 ? "Flat." : mom > 0 ? "Buyers in control." : "Sellers in control."}`,
    },
    {
      name: "Prediction crowd",
      value: linked.length ? `${crowd >= 0 ? "+" : ""}${(crowd * 100).toFixed(0)}pt` : "n/a",
      score: clamp(crowd * 3),
      weight: 0.15,
      why: linked.length
        ? `Linked YES/NO markets lean ${crowd > 0.03 ? "bullish" : crowd < -0.03 ? "bearish" : "neutral"} on this title.`
        : "No open prediction markets reference this title.",
    },
  ];

  const score = factors.reduce((t, f) => t + f.score * f.weight, 0);
  const rating: Rating =
    score > 0.45 ? "Strong buy" : score > 0.15 ? "Buy" : score < -0.45 ? "Strong sell" : score < -0.15 ? "Sell" : "Hold";
  const confidence = Math.round(a.confidence * (0.55 + 0.45 * Math.min(1, Math.abs(score) * 1.6)));
  const top = [...factors].sort((x, y) => Math.abs(y.score * y.weight) - Math.abs(x.score * x.weight))[0];

  return {
    rating,
    score,
    fairValue,
    upside: gap,
    confidence,
    factors,
    summary: `${rating} ${a.ticker}. ${top.why}`,
  };
}
