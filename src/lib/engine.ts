// Market engine: constant-product AMM for asset units + CPMM for YES/NO markets.
// Everything here is a simulation — no real money, no on-chain pricing.

export const FEE = 0.003;
export const CANDLE_SECONDS = 15;

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  /** Generated lead-in history (before this browser started recording), not prices anyone traded at. */
  modelled?: true;
}

export interface Pool {
  cash: number; // virtual quote reserve
  units: number; // virtual asset-unit reserve
}

export const poolPrice = (p: Pool) => p.cash / p.units;

/** A pool the AMM can price against: both reserves finite and strictly positive. */
export const validPool = (p: Pool) =>
  Number.isFinite(p.cash) && Number.isFinite(p.units) && p.cash > 0 && p.units > 0;

/**
 * Cost (incl. fee) to buy q units. `ok` is false for anything that is not a fillable order:
 * zero/negative/non-finite q, q at or above the pool's whole unit reserve (the curve's asymptote,
 * where cost would be infinite or negative), or a broken pool. Invalid quotes cost Infinity so any
 * `cost > cash` check also rejects them; callers should still check `ok`.
 */
export function quoteBuy(p: Pool, q: number) {
  if (q <= 0) return { ok: false, cost: 0, avg: poolPrice(p), after: p, impact: 0 };
  if (!validPool(p) || !Number.isFinite(q) || q >= p.units)
    return { ok: false, cost: Infinity, avg: NaN, after: p, impact: 0 };
  const k = p.cash * p.units;
  const newUnits = p.units - q;
  const newCash = k / newUnits;
  const raw = newCash - p.cash;
  const cost = raw * (1 + FEE);
  const after = { cash: newCash, units: newUnits };
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, cost: Infinity, avg: NaN, after: p, impact: 0 };
  return {
    ok: true,
    cost,
    avg: cost / q,
    after,
    impact: poolPrice(after) / poolPrice(p) - 1,
  };
}

/** Proceeds (net of fee) for selling q units. `ok` is false for zero/negative/non-finite q or a broken pool. */
export function quoteSell(p: Pool, q: number) {
  if (q <= 0) return { ok: false, proceeds: 0, avg: poolPrice(p), after: p, impact: 0 };
  if (!validPool(p) || !Number.isFinite(q)) return { ok: false, proceeds: 0, avg: NaN, after: p, impact: 0 };
  const k = p.cash * p.units;
  const newUnits = p.units + q;
  const newCash = k / newUnits;
  const raw = p.cash - newCash;
  const proceeds = raw * (1 - FEE);
  const after = { cash: newCash, units: newUnits };
  if (!Number.isFinite(proceeds) || proceeds < 0) return { ok: false, proceeds: 0, avg: NaN, after: p, impact: 0 };
  return {
    ok: true,
    proceeds,
    avg: proceeds / q,
    after,
    impact: poolPrice(after) / poolPrice(p) - 1,
  };
}

/** Move pool so price changes by `pct` (bots trading). Returns notional traded. */
export function pushPrice(p: Pool, pct: number): { pool: Pool; notional: number } {
  // A move of -100% or worse (or a NaN move) has no valid pool; leave it untouched rather than corrupt it.
  if (!validPool(p) || !Number.isFinite(pct) || pct <= -1) return { pool: p, notional: 0 };
  const k = p.cash * p.units;
  const target = poolPrice(p) * (1 + pct);
  // price = cash/units, cash*units = k  => units = sqrt(k/price)
  const units = Math.sqrt(k / target);
  const cash = k / units;
  return { pool: { cash, units }, notional: Math.abs(cash - p.cash) };
}

// ---- Binary prediction markets (CPMM) ----

export interface BinaryPool {
  yes: number;
  no: number;
}

export const yesPrice = (p: BinaryPool) => p.no / (p.yes + p.no);

export function quoteBinary(p: BinaryPool, side: "YES" | "NO", amount: number) {
  if (amount <= 0)
    return { shares: 0, after: p, avg: side === "YES" ? yesPrice(p) : 1 - yesPrice(p) };
  const k = p.yes * p.no;
  const net = amount * (1 - FEE);
  let yes = p.yes + net;
  let no = p.no + net;
  let shares: number;
  if (side === "YES") {
    const newYes = k / no;
    shares = yes - newYes;
    yes = newYes;
  } else {
    const newNo = k / yes;
    shares = no - newNo;
    no = newNo;
  }
  return { shares, after: { yes, no }, avg: amount / shares };
}

// ---- Seeded RNG + history generation ----

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Random-walk history ending exactly at `endPrice`. */
export function generateHistory(
  seedKey: string,
  endPrice: number,
  vol: number,
  count = 160,
  nowSec = Math.floor(Date.now() / 1000),
): Candle[] {
  const rnd = mulberry32(hashString(seedKey) ^ Math.floor(nowSec / 3600));
  const closes: number[] = [endPrice];
  let drift = (rnd() - 0.45) * vol * 0.6;
  for (let i = 1; i < count; i++) {
    if (i % 25 === 0) drift = (rnd() - 0.45) * vol * 0.6;
    const r = (rnd() - 0.5) * 2 * vol + drift;
    closes.push(closes[i - 1] / (1 + r));
  }
  closes.reverse();
  const start = Math.floor(nowSec / CANDLE_SECONDS) * CANDLE_SECONDS - (count - 1) * CANDLE_SECONDS;
  const candles: Candle[] = [];
  let prev = closes[0] * (1 + (rnd() - 0.5) * vol);
  for (let i = 0; i < count; i++) {
    const open = prev;
    const close = closes[i];
    const wick = Math.abs(close - open) + close * vol * rnd() * 0.8;
    candles.push({
      time: start + i * CANDLE_SECONDS,
      open,
      close,
      high: Math.max(open, close) + wick * rnd() * 0.6,
      low: Math.min(open, close) - wick * rnd() * 0.6,
      modelled: true,
    });
    prev = close;
  }
  return candles;
}

export function gaussian(rnd: () => number = Math.random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Units a dollar amount buys (side "buy") or must sell to receive it (side "sell"), fee included. */
export function unitsForDollars(p: Pool, dollars: number, side: "buy" | "sell") {
  if (dollars <= 0) return 0;
  const k = p.cash * p.units;
  if (side === "buy") return p.units - k / (p.cash + dollars / (1 + FEE));
  const rest = p.cash - dollars / (1 - FEE);
  return rest > 0 ? k / rest - p.units : Infinity;
}
