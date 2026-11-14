"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ASSETS,
  ASSET_BY_ID,
  ORACLE_EVENTS,
  computeEpi,
  type EpiParts,
} from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import {
  CANDLE_SECONDS,
  type BinaryPool,
  type Candle,
  type Pool,
  gaussian,
  generateHistory,
  hashString,
  mulberry32,
  poolPrice,
  pushPrice,
  quoteBinary,
  quoteBuy,
  quoteSell,
  yesPrice,
} from "@/lib/engine";

export const STARTING_CASH = 1000;
const POOL_UNITS = 60_000;
/** How strongly a change in EPI moves price (pct move per pct EPI change). */
const EPI_SENSITIVITY = 2.6;

export interface MarketState {
  pool: Pool;
  epiParts: EpiParts;
  epi: number;
  epiHistory: { time: number; value: number }[];
  metricValue: number;
  ref24h: number;
  volume24h: number;
  momentum: number; // remaining pct move bots will push
  lastEventAt?: number;
  /** Last NEAR tx that published this market's EPI via the trusted oracle. */
  oracleTx?: string;
}

export interface PredictionState {
  pool: BinaryPool;
  volume: number;
  momentum: number; // remaining probability move
  resolved: "YES" | "NO" | null;
}

export type TradeKind = "BUY" | "SELL" | "YES" | "NO" | "PAYOUT";

export interface Trade {
  id: string;
  ts: number;
  kind: TradeKind;
  refId: string; // asset id or prediction id
  label: string;
  qty: number;
  price: number;
  total: number;
  sig?: string;
  sigStatus?: "pending" | "confirmed" | "failed";
  nearTx?: string;
  nearStatus?: "pending" | "confirmed" | "failed";
}

export interface ChainPrefs {
  solana: boolean;
  near: boolean;
}

export interface Position {
  marketId: string;
  side: "YES" | "NO";
  shares: number;
  cost: number;
}

export interface FeedItem {
  id: string;
  ts: number;
  type: "oracle" | "trade" | "bot" | "settle" | "chain";
  text: string;
  refId?: string;
  href?: string;
  tone: "up" | "down" | "neutral";
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "up" | "down" | "neutral";
  href?: string;
}

interface Store {
  markets: Record<string, MarketState>;
  predictions: Record<string, PredictionState>;
  cash: number;
  holdings: Record<string, { units: number; cost: number }>;
  positions: Position[];
  trades: Trade[];
  realized: number;
  feed: FeedItem[];
  chains: ChainPrefs;
  // ephemeral
  candles: Record<string, Candle[]>;
  toasts: Toast[];

  ensureHistory: () => void;
  tick: () => void;
  buy: (assetId: string, qty: number) => Trade | null;
  sell: (assetId: string, qty: number) => Trade | null;
  oracle: (assetId: string, eventId: string) => void;
  randomOracle: () => string;
  predict: (marketId: string, side: "YES" | "NO", amount: number) => Trade | null;
  resolve: (marketId: string, outcome: "YES" | "NO") => void;
  setTradeSig: (tradeId: string, patch: Pick<Trade, "sig" | "sigStatus">) => void;
  setTradeNear: (tradeId: string, patch: Pick<Trade, "nearTx" | "nearStatus">) => void;
  setChains: (patch: Partial<ChainPrefs>) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  reset: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function seedMarkets(): Record<string, MarketState> {
  const now = Math.floor(Date.now() / 1000);
  return Object.fromEntries(
    ASSETS.map((a) => {
      const rnd = mulberry32(hashString(a.id));
      const change = -0.12 + rnd() * 0.36;
      const epi = computeEpi(a.epiParts);
      const history = Array.from({ length: 24 }, (_, i) => ({
        time: now - (24 - i) * 3600,
        value: Math.round((epi + (rnd() - 0.55) * 6 * ((24 - i) / 24)) * 10) / 10,
      }));
      history.push({ time: now, value: epi });
      return [
        a.id,
        {
          pool: { cash: a.basePrice * POOL_UNITS, units: POOL_UNITS },
          epiParts: { ...a.epiParts },
          epi,
          epiHistory: history,
          metricValue: a.metric.value,
          ref24h: a.basePrice / (1 + change),
          volume24h: Math.round(20_000 + rnd() * 90_000),
          momentum: 0,
        } satisfies MarketState,
      ];
    }),
  );
}

function seedPredictions(): Record<string, PredictionState> {
  return Object.fromEntries(
    PREDICTIONS.map((p) => [
      p.id,
      {
        pool: poolForProb(p.yesProb, p.liquidity),
        volume: p.volume,
        momentum: 0,
        resolved: null,
      } satisfies PredictionState,
    ]),
  );
}

function poolForProb(p: number, k: number): BinaryPool {
  // price_yes = no / (yes + no)  => no/yes = p/(1-p); keep yes*no = k^2
  const ratio = p / (1 - p);
  const yes = k / Math.sqrt(ratio);
  return { yes, no: k * k / yes };
}

function shiftProb(pool: BinaryPool, target: number): BinaryPool {
  const k = Math.sqrt(pool.yes * pool.no);
  return poolForProb(Math.min(0.97, Math.max(0.03, target)), k);
}

function initialState() {
  return {
    markets: seedMarkets(),
    predictions: seedPredictions(),
    cash: STARTING_CASH,
    holdings: {} as Store["holdings"],
    positions: [] as Position[],
    trades: [] as Trade[],
    realized: 0,
    feed: [] as FeedItem[],
  };
}

function appendCandle(list: Candle[], price: number): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / CANDLE_SECONDS) * CANDLE_SECONDS;
  const last = list[list.length - 1];
  if (last && last.time === bucket) {
    const updated = {
      ...last,
      close: price,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
    };
    return [...list.slice(0, -1), updated];
  }
  const open = last ? last.close : price;
  const next = [
    ...list,
    { time: bucket, open, close: price, high: Math.max(open, price), low: Math.min(open, price) },
  ];
  return next.length > 400 ? next.slice(-400) : next;
}

/** Ask the trusted oracle service to publish the new EPI on the NEAR contract (report_epi). */
async function publishToNear(assetId: string, epi: number, note: string) {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/oracle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId, epi, note }),
    });
    const json = (await res.json()) as { hash?: string; error?: string };
    if (!res.ok || !json.hash) return;
    const hash = json.hash;
    const a = ASSET_BY_ID[assetId];
    const st = useMarket.getState();
    useMarket.setState({
      markets: { ...st.markets, [assetId]: { ...st.markets[assetId], oracleTx: hash } },
      feed: pushFeed(st.feed, {
        type: "chain",
        tone: "neutral",
        refId: assetId,
        href: `https://testnet.nearblocks.io/txns/${hash}`,
        text: `NEAR · oracle published ${a.ticker} EPI ${epi.toFixed(1)} on-chain (report_epi)`,
      }),
    });
    st.toast({
      title: "EPI published on NEAR",
      body: `Trusted oracle signed report_epi · ${hash.slice(0, 10)}…`,
      tone: "neutral",
      href: `https://testnet.nearblocks.io/txns/${hash}`,
    });
  } catch {
    /* off-chain demo continues */
  }
}

const pushFeed = (feed: FeedItem[], item: Omit<FeedItem, "id" | "ts">) =>
  [{ ...item, id: uid(), ts: Date.now() }, ...feed].slice(0, 60);

export const useMarket = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState(),
      chains: { solana: true, near: true },
      candles: {},
      toasts: [],

      ensureHistory: () => {
        const { markets, candles } = get();
        if (Object.keys(candles).length) return;
        const next: Record<string, Candle[]> = {};
        for (const a of ASSETS) {
          next[a.id] = generateHistory(a.id, poolPrice(markets[a.id].pool), a.volatility);
        }
        set({ candles: next });
      },

      tick: () => {
        const s = get();
        const markets = { ...s.markets };
        const candles = { ...s.candles };
        const predictions = { ...s.predictions };
        let feed = s.feed;

        for (const a of ASSETS) {
          const m = markets[a.id];
          const noise = gaussian() * a.volatility * 0.22;
          const push = m.momentum * 0.22;
          const { pool, notional } = pushPrice(m.pool, noise + push);
          const remaining = m.momentum - push;
          markets[a.id] = {
            ...m,
            pool,
            momentum: Math.abs(remaining) < 0.0004 ? 0 : remaining,
            volume24h: m.volume24h + notional,
          };
          if (candles[a.id]) candles[a.id] = appendCandle(candles[a.id], poolPrice(pool));
          if (Math.abs(push) > 0.004 && Math.random() < 0.5) {
            feed = pushFeed(feed, {
              type: "bot",
              tone: push > 0 ? "up" : "down",
              refId: a.id,
              text: `Traders ${push > 0 ? "bought" : "sold"} ${a.ticker} · $${Math.round(notional).toLocaleString()}`,
            });
          }
        }

        for (const p of PREDICTIONS) {
          const st = predictions[p.id];
          if (st.resolved) continue;
          const push = st.momentum * 0.25;
          const noise = gaussian() * 0.0025;
          const prob = yesPrice(st.pool) + push + noise;
          const remaining = st.momentum - push;
          predictions[p.id] = {
            ...st,
            pool: shiftProb(st.pool, prob),
            momentum: Math.abs(remaining) < 0.001 ? 0 : remaining,
            volume: st.volume + Math.abs(push + noise) * 40_000,
          };
        }

        set({ markets, candles, predictions, feed });
      },

      buy: (assetId, qty) => {
        const s = get();
        const a = ASSET_BY_ID[assetId];
        const m = s.markets[assetId];
        if (!a || !m || qty <= 0) return null;
        const q = quoteBuy(m.pool, qty);
        if (q.cost > s.cash + 1e-9) {
          get().toast({ title: "Insufficient balance", body: "Top up is not needed — sell something or reset the demo.", tone: "down" });
          return null;
        }
        const h = s.holdings[assetId] ?? { units: 0, cost: 0 };
        const trade: Trade = {
          id: uid(),
          ts: Date.now(),
          kind: "BUY",
          refId: assetId,
          label: a.ticker,
          qty,
          price: q.avg,
          total: q.cost,
        };
        set({
          cash: s.cash - q.cost,
          holdings: { ...s.holdings, [assetId]: { units: h.units + qty, cost: h.cost + q.cost } },
          markets: { ...s.markets, [assetId]: { ...m, pool: q.after, volume24h: m.volume24h + q.cost } },
          candles: s.candles[assetId]
            ? { ...s.candles, [assetId]: appendCandle(s.candles[assetId], poolPrice(q.after)) }
            : s.candles,
          trades: [trade, ...s.trades],
          feed: pushFeed(s.feed, { type: "trade", tone: "up", refId: assetId, text: `You bought ${qty} ${a.ticker} @ $${q.avg.toFixed(2)}` }),
        });
        return trade;
      },

      sell: (assetId, qty) => {
        const s = get();
        const a = ASSET_BY_ID[assetId];
        const m = s.markets[assetId];
        const h = s.holdings[assetId];
        if (!a || !m || !h || qty <= 0 || qty > h.units + 1e-9) return null;
        const q = quoteSell(m.pool, qty);
        const costBasis = (h.cost / h.units) * qty;
        const remaining = h.units - qty;
        const holdings = { ...s.holdings };
        if (remaining < 1e-9) delete holdings[assetId];
        else holdings[assetId] = { units: remaining, cost: h.cost - costBasis };
        const trade: Trade = {
          id: uid(),
          ts: Date.now(),
          kind: "SELL",
          refId: assetId,
          label: a.ticker,
          qty,
          price: q.avg,
          total: q.proceeds,
        };
        set({
          cash: s.cash + q.proceeds,
          realized: s.realized + (q.proceeds - costBasis),
          holdings,
          markets: { ...s.markets, [assetId]: { ...m, pool: q.after, volume24h: m.volume24h + q.proceeds } },
          candles: s.candles[assetId]
            ? { ...s.candles, [assetId]: appendCandle(s.candles[assetId], poolPrice(q.after)) }
            : s.candles,
          trades: [trade, ...s.trades],
          feed: pushFeed(s.feed, { type: "trade", tone: "down", refId: assetId, text: `You sold ${qty} ${a.ticker} @ $${q.avg.toFixed(2)}` }),
        });
        return trade;
      },

      oracle: (assetId, eventId) => {
        const s = get();
        const a = ASSET_BY_ID[assetId];
        const ev = ORACLE_EVENTS.find((e) => e.id === eventId);
        const m = s.markets[assetId];
        if (!a || !ev || !m) return;
        const parts = { ...m.epiParts };
        for (const [k, d] of Object.entries(ev.delta) as [keyof EpiParts, number][]) {
          parts[k] = Math.max(1, Math.min(100, parts[k] + d));
        }
        const epi = computeEpi(parts);
        const dEpi = (epi - m.epi) / m.epi;
        const move = dEpi * EPI_SENSITIVITY;
        const now = Math.floor(Date.now() / 1000);

        const predictions = { ...s.predictions };
        for (const p of PREDICTIONS) {
          if (p.assetId !== assetId || predictions[p.id].resolved) continue;
          predictions[p.id] = {
            ...predictions[p.id],
            momentum: predictions[p.id].momentum + p.sensitivity * dEpi * 2.2,
          };
        }

        const up = epi >= m.epi;
        set({
          markets: {
            ...s.markets,
            [assetId]: {
              ...m,
              epiParts: parts,
              epi,
              epiHistory: [...m.epiHistory, { time: now, value: epi }].slice(-200),
              metricValue: m.metricValue * ev.metricMult,
              momentum: m.momentum + move,
              lastEventAt: Date.now(),
            },
          },
          predictions,
          feed: pushFeed(s.feed, {
            type: "oracle",
            tone: up ? "up" : "down",
            refId: assetId,
            text: `ORACLE · ${ev.detail(a)} · EPI ${m.epi.toFixed(1)} → ${epi.toFixed(1)}`,
          }),
        });
        get().toast({
          title: `Oracle update · ${a.ticker}`,
          body: `${ev.detail(a)}. EPI ${m.epi.toFixed(1)} → ${epi.toFixed(1)}`,
          tone: up ? "up" : "down",
          href: `/asset/${assetId}`,
        });
        void publishToNear(assetId, epi, ev.label);
      },

      randomOracle: () => {
        const a = ASSETS[Math.floor(Math.random() * ASSETS.length)];
        const positive = ORACLE_EVENTS.filter((e) => !e.id.includes("pan") && !e.id.includes("miss"));
        const pool = Math.random() < 0.75 ? positive : ORACLE_EVENTS;
        const ev = pool[Math.floor(Math.random() * pool.length)];
        get().oracle(a.id, ev.id);
        return a.id;
      },

      predict: (marketId, side, amount) => {
        const s = get();
        const seed = PREDICTIONS.find((p) => p.id === marketId);
        const st = s.predictions[marketId];
        if (!seed || !st || st.resolved || amount <= 0) return null;
        if (amount > s.cash + 1e-9) {
          get().toast({ title: "Insufficient balance", tone: "down" });
          return null;
        }
        const q = quoteBinary(st.pool, side, amount);
        const positions = [...s.positions];
        const idx = positions.findIndex((p) => p.marketId === marketId && p.side === side);
        if (idx >= 0) {
          positions[idx] = {
            ...positions[idx],
            shares: positions[idx].shares + q.shares,
            cost: positions[idx].cost + amount,
          };
        } else positions.push({ marketId, side, shares: q.shares, cost: amount });
        const trade: Trade = {
          id: uid(),
          ts: Date.now(),
          kind: side,
          refId: marketId,
          label: seed.question,
          qty: q.shares,
          price: q.avg,
          total: amount,
        };
        set({
          cash: s.cash - amount,
          positions,
          predictions: { ...s.predictions, [marketId]: { ...st, pool: q.after, volume: st.volume + amount } },
          trades: [trade, ...s.trades],
          feed: pushFeed(s.feed, {
            type: "trade",
            tone: side === "YES" ? "up" : "down",
            refId: marketId,
            text: `You bought ${q.shares.toFixed(1)} ${side} @ ${(q.avg * 100).toFixed(0)}¢`,
          }),
        });
        return trade;
      },

      resolve: (marketId, outcome) => {
        const s = get();
        const st = s.predictions[marketId];
        const seed = PREDICTIONS.find((p) => p.id === marketId);
        if (!st || st.resolved || !seed) return;
        const mine = s.positions.filter((p) => p.marketId === marketId);
        const payout = mine.filter((p) => p.side === outcome).reduce((t, p) => t + p.shares, 0);
        const cost = mine.reduce((t, p) => t + p.cost, 0);
        const trades = payout
          ? [
              {
                id: uid(),
                ts: Date.now(),
                kind: "PAYOUT" as const,
                refId: marketId,
                label: seed.question,
                qty: payout,
                price: 1,
                total: payout,
              },
              ...s.trades,
            ]
          : s.trades;
        set({
          cash: s.cash + payout,
          realized: s.realized + payout - cost,
          positions: s.positions.filter((p) => p.marketId !== marketId),
          predictions: { ...s.predictions, [marketId]: { ...st, resolved: outcome, momentum: 0 } },
          trades,
          feed: pushFeed(s.feed, {
            type: "settle",
            tone: outcome === "YES" ? "up" : "down",
            refId: marketId,
            text: `SETTLED ${outcome} · ${seed.question}`,
          }),
        });
        if (mine.length)
          get().toast({
            title: `Market settled ${outcome}`,
            body: payout ? `You received $${payout.toFixed(2)}` : "Your position expired worthless.",
            tone: payout ? "up" : "down",
          });
      },

      setTradeSig: (tradeId, patch) =>
        set((s) => ({ trades: s.trades.map((t) => (t.id === tradeId ? { ...t, ...patch } : t)) })),

      setTradeNear: (tradeId, patch) =>
        set((s) => ({ trades: s.trades.map((t) => (t.id === tradeId ? { ...t, ...patch } : t)) })),

      setChains: (patch) => set((s) => ({ chains: { ...s.chains, ...patch } })),

      toast: (t) => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
        setTimeout(() => get().dismissToast(id), 5200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      reset: () => {
        set({ ...initialState(), candles: {} });
        get().ensureHistory();
      },
    }),
    {
      name: "entx-demo-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        markets: s.markets,
        predictions: s.predictions,
        cash: s.cash,
        holdings: s.holdings,
        positions: s.positions,
        trades: s.trades,
        realized: s.realized,
        feed: s.feed,
        chains: s.chains,
      }),
    },
  ),
);

// ---- selectors / derived helpers ----

export const priceOf = (m: MarketState) => poolPrice(m.pool);
export const change24h = (m: MarketState) => poolPrice(m.pool) / m.ref24h - 1;

export function portfolioValue(s: Pick<Store, "cash" | "holdings" | "markets" | "positions" | "predictions">) {
  let holdings = 0;
  let cost = 0;
  for (const [id, h] of Object.entries(s.holdings)) {
    holdings += h.units * poolPrice(s.markets[id].pool);
    cost += h.cost;
  }
  let preds = 0;
  let predCost = 0;
  for (const p of s.positions) {
    const st = s.predictions[p.marketId];
    const yp = yesPrice(st.pool);
    preds += p.shares * (p.side === "YES" ? yp : 1 - yp);
    predCost += p.cost;
  }
  return {
    holdings,
    preds,
    unrealized: holdings - cost + preds - predCost,
    total: s.cash + holdings + preds,
  };
}
