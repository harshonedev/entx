import { describe, expect, it } from "vitest";
import {
  CANDLE_SECONDS,
  FEE,
  gaussian,
  generateHistory,
  hashString,
  mulberry32,
  poolPrice,
  pushPrice,
  quoteBinary,
  quoteBuy,
  quoteSell,
  unitsForDollars,
  yesPrice,
  type Pool,
} from "./engine";

const pool: Pool = { cash: 600_000, units: 60_000 }; // price 10

describe("poolPrice", () => {
  it("is cash / units", () => {
    expect(poolPrice(pool)).toBe(10);
  });
});

describe("quoteBuy", () => {
  it("returns zero cost for non-positive quantities", () => {
    for (const q of [0, -5]) {
      const r = quoteBuy(pool, q);
      expect(r.cost).toBe(0);
      expect(r.after).toBe(pool);
      expect(r.impact).toBe(0);
      expect(r.avg).toBe(10);
    }
  });

  it("keeps the constant product before fees", () => {
    const r = quoteBuy(pool, 100);
    expect(r.after.cash * r.after.units).toBeCloseTo(pool.cash * pool.units, 3);
    expect(r.after.units).toBe(pool.units - 100);
  });

  it("charges more than spot and includes the fee", () => {
    const r = quoteBuy(pool, 100);
    const raw = r.after.cash - pool.cash;
    expect(r.cost).toBeCloseTo(raw * (1 + FEE), 9);
    expect(r.avg).toBeGreaterThan(10);
    expect(r.avg).toBeCloseTo(r.cost / 100, 9);
  });

  it("moves the price up (positive impact) and impact grows with size", () => {
    const small = quoteBuy(pool, 10);
    const big = quoteBuy(pool, 1000);
    expect(small.impact).toBeGreaterThan(0);
    expect(big.impact).toBeGreaterThan(small.impact);
    expect(poolPrice(big.after)).toBeGreaterThan(10);
  });
});

describe("quoteSell", () => {
  it("returns zero proceeds for non-positive quantities", () => {
    const r = quoteSell(pool, 0);
    expect(r.proceeds).toBe(0);
    expect(r.after).toBe(pool);
  });

  it("pays less than spot, net of fee, and moves price down", () => {
    const r = quoteSell(pool, 100);
    const raw = pool.cash - r.after.cash;
    expect(r.proceeds).toBeCloseTo(raw * (1 - FEE), 9);
    expect(r.avg).toBeLessThan(10);
    expect(r.impact).toBeLessThan(0);
    expect(r.after.cash * r.after.units).toBeCloseTo(pool.cash * pool.units, 3);
  });

  it("round trip buy then sell loses money (fees + spread)", () => {
    const b = quoteBuy(pool, 500);
    const s = quoteSell(b.after, 500);
    expect(s.proceeds).toBeLessThan(b.cost);
    // pool returns to its original reserves
    expect(s.after.units).toBeCloseTo(pool.units, 6);
    expect(s.after.cash).toBeCloseTo(pool.cash, 3);
  });
});

describe("pushPrice", () => {
  it.each([0.05, -0.05, 0.2, -0.3, 0])("moves price by exactly %s", (pct) => {
    const { pool: next, notional } = pushPrice(pool, pct);
    expect(poolPrice(next)).toBeCloseTo(10 * (1 + pct), 9);
    expect(next.cash * next.units).toBeCloseTo(pool.cash * pool.units, 2);
    expect(notional).toBeGreaterThanOrEqual(0);
    if (pct === 0) expect(notional).toBeCloseTo(0, 6);
  });
});

describe("binary markets", () => {
  it("yesPrice is no / (yes + no)", () => {
    expect(yesPrice({ yes: 100, no: 100 })).toBe(0.5);
    expect(yesPrice({ yes: 100, no: 300 })).toBe(0.75);
  });

  it("quoteBinary with non-positive amount is a no-op", () => {
    const p = { yes: 100, no: 300 };
    expect(quoteBinary(p, "YES", 0)).toEqual({ shares: 0, after: p, avg: 0.75 });
    expect(quoteBinary(p, "NO", -1).avg).toBeCloseTo(0.25);
  });

  it("buying YES raises YES price, keeps product, and returns > amount shares", () => {
    const p = { yes: 1000, no: 1000 };
    const r = quoteBinary(p, "YES", 100);
    expect(yesPrice(r.after)).toBeGreaterThan(0.5);
    expect(r.after.yes * r.after.no).toBeCloseTo(p.yes * p.no, 6);
    expect(r.shares).toBeGreaterThan(100);
    expect(r.avg).toBeCloseTo(100 / r.shares, 12);
    expect(r.avg).toBeGreaterThan(0.5);
    expect(r.avg).toBeLessThan(1);
  });

  it("buying NO lowers YES price", () => {
    const p = { yes: 1000, no: 1000 };
    const r = quoteBinary(p, "NO", 100);
    expect(yesPrice(r.after)).toBeLessThan(0.5);
    expect(r.after.yes * r.after.no).toBeCloseTo(p.yes * p.no, 6);
  });

  it("YES and NO are symmetric on a balanced pool", () => {
    const p = { yes: 1000, no: 1000 };
    expect(quoteBinary(p, "YES", 50).shares).toBeCloseTo(quoteBinary(p, "NO", 50).shares, 9);
  });
});

describe("mulberry32 / hashString", () => {
  it("is deterministic for the same seed and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("hashString is stable, unsigned 32-bit, and discriminates", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    const h = hashString("the-odyssey");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(hashString("")).toBe(2166136261);
  });
});

describe("generateHistory", () => {
  const now = 1_800_000_000;

  it("produces `count` candles spaced by CANDLE_SECONDS ending at the current bucket", () => {
    const c = generateHistory("x", 12.5, 0.01, 50, now);
    expect(c).toHaveLength(50);
    for (let i = 1; i < c.length; i++) expect(c[i].time - c[i - 1].time).toBe(CANDLE_SECONDS);
    expect(c.at(-1)!.time).toBe(Math.floor(now / CANDLE_SECONDS) * CANDLE_SECONDS);
  });

  it("ends exactly at endPrice", () => {
    expect(generateHistory("y", 7.77, 0.02, 160, now).at(-1)!.close).toBe(7.77);
  });

  it("has valid OHLC and chains open to previous close", () => {
    const c = generateHistory("z", 20, 0.015, 160, now);
    c.forEach((k, i) => {
      expect(k.high).toBeGreaterThanOrEqual(Math.max(k.open, k.close));
      expect(k.low).toBeLessThanOrEqual(Math.min(k.open, k.close));
      if (i > 0) expect(k.open).toBe(c[i - 1].close);
      expect(k.close).toBeGreaterThan(0);
    });
  });

  it("is deterministic within the same hour, different across keys", () => {
    expect(generateHistory("a", 10, 0.01, 30, now)).toEqual(generateHistory("a", 10, 0.01, 30, now + 1));
    expect(generateHistory("a", 10, 0.01, 30, now)).not.toEqual(generateHistory("b", 10, 0.01, 30, now));
  });
});

describe("gaussian", () => {
  it("has ~zero mean and ~unit variance", () => {
    const rnd = mulberry32(7);
    const xs = Array.from({ length: 20_000 }, () => gaussian(rnd));
    const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
    const variance = xs.reduce((t, x) => t + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(variance).toBeGreaterThan(0.9);
    expect(variance).toBeLessThan(1.1);
  });

  it("skips zero draws (no -Infinity from log(0))", () => {
    const seq = [0, 0.5, 0, 0.25];
    let i = 0;
    const x = gaussian(() => seq[i++]);
    expect(Number.isFinite(x)).toBe(true);
  });
});

describe("unitsForDollars", () => {
  it("returns 0 for non-positive dollars", () => {
    expect(unitsForDollars(pool, 0, "buy")).toBe(0);
    expect(unitsForDollars(pool, -1, "sell")).toBe(0);
  });

  it("buy: the returned units cost exactly the dollar amount", () => {
    const u = unitsForDollars(pool, 250, "buy");
    expect(quoteBuy(pool, u).cost).toBeCloseTo(250, 6);
  });

  it("sell: selling the returned units yields exactly the dollar amount", () => {
    const u = unitsForDollars(pool, 250, "sell");
    expect(quoteSell(pool, u).proceeds).toBeCloseTo(250, 6);
  });

  it("sell beyond pool cash is impossible (Infinity)", () => {
    expect(unitsForDollars(pool, pool.cash * 2, "sell")).toBe(Infinity);
  });
});
