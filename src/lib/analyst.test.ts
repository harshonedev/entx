import { beforeEach, describe, expect, it } from "vitest";
import { analyze } from "./analyst";
import { ASSETS, computeEpi } from "./assets";
import { PREDICTIONS } from "./predictions";
import { poolPrice, type Candle } from "./engine";
import { useMarket, type MarketState } from "@/store/market";

const S = () => useMarket.getState();
const withLinked = ASSETS.find((a) => PREDICTIONS.some((p) => p.assetId === a.id))!;
const withoutLinked = ASSETS.find((a) => !PREDICTIONS.some((p) => p.assetId === a.id));

const flatCandles = (price: number, n = 20): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: i, open: price, high: price, low: price, close: price }));

/** A market in equilibrium: price at base, EPI flat, no prediction lean. */
function neutral(a = ASSETS[0]): MarketState {
  const m = S().markets[a.id];
  const epi = computeEpi(a.epiParts);
  return {
    ...m,
    pool: { cash: a.basePrice * 1000, units: 1000 },
    epi,
    epiHistory: Array.from({ length: 30 }, (_, i) => ({ time: i, value: epi })),
  };
}

beforeEach(() => S().reset());

describe("analyze", () => {
  it("returns four weighted factors whose weights sum to 1", () => {
    const s = analyze(ASSETS[0].id, neutral(), flatCandles(ASSETS[0].basePrice), S().predictions);
    expect(s.factors.map((f) => f.name)).toEqual(["Fundamental gap", "EPI trend", "Price momentum", "Prediction crowd"]);
    expect(s.factors.reduce((t, f) => t + f.weight, 0)).toBeCloseTo(1, 12);
    for (const f of s.factors) {
      expect(f.score).toBeGreaterThanOrEqual(-1);
      expect(f.score).toBeLessThanOrEqual(1);
    }
  });

  it("neutral market rates Hold with fair value = base price", () => {
    const a = withoutLinked ?? ASSETS[0];
    const preds = Object.fromEntries(
      Object.entries(S().predictions).map(([k, v]) => [k, { ...v, pool: { yes: 100, no: 100 } }]),
    );
    const s = analyze(a.id, neutral(a), flatCandles(a.basePrice), preds);
    expect(s.rating).toBe("Hold");
    expect(s.fairValue).toBeCloseTo(a.basePrice, 9);
    expect(s.upside).toBeCloseTo(0, 9);
    expect(Math.abs(s.score)).toBeLessThan(0.15);
    expect(s.summary.startsWith(`Hold ${a.ticker}.`)).toBe(true);
  });

  it("underpriced vs EPI with rising trend and momentum → Strong buy", () => {
    const a = ASSETS[0];
    const m = neutral(a);
    const epi = m.epi * 1.15;
    const cheap = a.basePrice * 0.8;
    const s = analyze(
      a.id,
      {
        ...m,
        epi,
        pool: { cash: cheap * 1000, units: 1000 },
        epiHistory: Array.from({ length: 30 }, (_, i) => ({ time: i, value: i < 10 ? m.epi : epi })),
      },
      flatCandles(cheap * 0.9),
      S().predictions,
    );
    expect(s.upside).toBeGreaterThan(0.3);
    expect(s.rating).toBe("Strong buy");
    expect(s.factors[0].why).toMatch(/upside/);
  });

  it("overpriced with falling EPI → sell side", () => {
    const a = ASSETS[0];
    const m = neutral(a);
    const epi = m.epi * 0.9;
    const rich = a.basePrice * 1.3;
    const s = analyze(
      a.id,
      {
        ...m,
        epi,
        pool: { cash: rich * 1000, units: 1000 },
        epiHistory: Array.from({ length: 30 }, (_, i) => ({ time: i, value: i < 10 ? m.epi : epi })),
      },
      flatCandles(rich * 1.1),
      S().predictions,
    );
    expect(["Sell", "Strong sell"]).toContain(s.rating);
    expect(s.factors[0].why).toMatch(/ahead of/);
    expect(s.factors[1].why).toMatch(/fell/);
  });

  it("fair value floors at 20% of base price", () => {
    const a = ASSETS[0];
    const s = analyze(a.id, { ...neutral(a), epi: 1 }, undefined, S().predictions);
    expect(s.fairValue).toBeCloseTo(a.basePrice * 0.2, 9);
  });

  it("works without candles (momentum 0, 'Flat.')", () => {
    const a = ASSETS[0];
    const s = analyze(a.id, neutral(a), undefined, S().predictions);
    expect(s.factors[2].value).toBe("+0.0%");
    expect(s.factors[2].why).toMatch(/Flat\./);
  });

  it("prediction crowd uses linked open markets only", () => {
    const linked = PREDICTIONS.filter((p) => p.assetId === withLinked.id);
    const bullish = Object.fromEntries(
      Object.entries(S().predictions).map(([k, v]) => {
        const p = PREDICTIONS.find((x) => x.id === k)!;
        // YES price 0.9 when sensitivity +1, 0.1 when -1 → bullish for asset either way
        const yes = p.sensitivity === 1 ? 10 : 90;
        return [k, { ...v, pool: { yes, no: 100 - yes } }];
      }),
    );
    const s = analyze(withLinked.id, neutral(withLinked), undefined, bullish);
    expect(s.factors[3].score).toBeGreaterThan(0);
    expect(s.factors[3].why).toMatch(/bullish/);

    const allResolved = Object.fromEntries(
      Object.entries(bullish).map(([k, v]) => [k, linked.some((p) => p.id === k) ? { ...v, resolved: "YES" as const } : v]),
    );
    const r = analyze(withLinked.id, neutral(withLinked), undefined, allResolved);
    expect(r.factors[3].value).toBe("n/a");
    expect(r.factors[3].score).toBe(0);
  });

  it("confidence scales with asset data confidence and conviction", () => {
    const a = ASSETS[0];
    const hold = analyze(a.id, neutral(a), undefined, S().predictions);
    expect(hold.confidence).toBeGreaterThanOrEqual(Math.round(a.confidence * 0.55) - 1);
    expect(hold.confidence).toBeLessThanOrEqual(a.confidence);
  });

  it("works on every live seeded market", () => {
    S().ensureHistory();
    for (const a of ASSETS) {
      const s = analyze(a.id, S().markets[a.id], S().candles[a.id], S().predictions);
      expect(Number.isFinite(s.score)).toBe(true);
      expect(s.fairValue).toBeGreaterThan(0);
      expect(poolPrice(S().markets[a.id].pool)).toBeGreaterThan(0);
    }
  });
});
