import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTING_CASH, change24h, portfolioValue, priceOf, useMarket } from "./market";
import { ASSETS, ASSET_BY_ID, ORACLE_EVENTS, computeEpi } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { poolPrice, quoteBinary, quoteBuy, quoteSell, yesPrice } from "@/lib/engine";

const A = ASSETS[0].id;
const linkedPred = PREDICTIONS.find((p) => p.assetId)!;
const P = PREDICTIONS[0].id;
const S = () => useMarket.getState();

beforeEach(() => {
  vi.useFakeTimers();
  // fetch is used by publishToNear after oracle events; keep it inert by default
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
  useMarket.setState({ toasts: [], chains: { solana: true, near: true } });
  S().reset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("initial state", () => {
  it("seeds every asset and prediction", () => {
    expect(S().cash).toBe(STARTING_CASH);
    expect(Object.keys(S().markets).sort()).toEqual(ASSETS.map((a) => a.id).sort());
    expect(Object.keys(S().predictions).sort()).toEqual(PREDICTIONS.map((p) => p.id).sort());
    expect(S().trades).toEqual([]);
    expect(S().positions).toEqual([]);
    expect(S().holdings).toEqual({});
  });

  it("starts each market at its base price and seeded EPI", () => {
    for (const a of ASSETS) {
      const m = S().markets[a.id];
      expect(priceOf(m)).toBeCloseTo(a.basePrice, 9);
      expect(m.epi).toBe(computeEpi(a.epiParts));
      expect(m.epiHistory).toHaveLength(25);
      expect(m.epiHistory.at(-1)!.value).toBe(m.epi);
    }
  });

  it("seeded 24h EPI direction agrees with seeded price direction", () => {
    for (const a of ASSETS) {
      const m = S().markets[a.id];
      const priceUp = change24h(m) > 0;
      const epiStart = m.epiHistory[0].value;
      // allow noise for tiny moves
      if (Math.abs(change24h(m)) > 0.03) expect(m.epi > epiStart).toBe(priceUp);
    }
  });

  it("seeds prediction pools at their seeded YES probability", () => {
    for (const p of PREDICTIONS) {
      const st = S().predictions[p.id];
      expect(yesPrice(st.pool)).toBeCloseTo(p.yesProb, 9);
      expect(Math.sqrt(st.pool.yes * st.pool.no)).toBeCloseTo(p.liquidity, 6);
      expect(st.resolved).toBeNull();
    }
  });

  it("ensureHistory builds candles once, ending at current price", () => {
    expect(Object.keys(S().candles).length).toBe(ASSETS.length); // reset calls ensureHistory
    const before = S().candles;
    S().ensureHistory();
    expect(S().candles).toBe(before);
    expect(S().candles[A].at(-1)!.close).toBeCloseTo(priceOf(S().markets[A]), 9);
  });
});

describe("buy", () => {
  it("debits exact AMM cost, credits holdings, moves price, records trade/feed/toast", () => {
    const pool = S().markets[A].pool;
    const q = quoteBuy(pool, 10);
    const t = S().buy(A, 10)!;
    expect(t).toMatchObject({ kind: "BUY", refId: A, qty: 10, label: ASSET_BY_ID[A].ticker });
    expect(t.total).toBeCloseTo(q.cost, 9);
    expect(S().cash).toBeCloseTo(STARTING_CASH - q.cost, 9);
    expect(S().holdings[A]).toEqual({ units: 10, cost: q.cost });
    expect(priceOf(S().markets[A])).toBeGreaterThan(poolPrice(pool));
    expect(S().trades[0]).toBe(t);
    expect(S().feed[0]).toMatchObject({ type: "trade", tone: "up", refId: A });
    expect(S().toasts.at(-1)!.title).toBe(`Bought 10 ${ASSET_BY_ID[A].ticker}`);
    expect(S().candles[A].at(-1)!.close).toBeCloseTo(priceOf(S().markets[A]), 9);
  });

  it("accumulates holdings across buys", () => {
    S().buy(A, 2);
    S().buy(A, 3);
    expect(S().holdings[A].units).toBe(5);
    expect(S().trades).toHaveLength(2);
  });

  it("rejects bad input", () => {
    expect(S().buy(A, 0)).toBeNull();
    expect(S().buy(A, -1)).toBeNull();
    expect(S().buy("nope", 1)).toBeNull();
    expect(S().cash).toBe(STARTING_CASH);
  });

  it("rejects when cash insufficient and shows toast", () => {
    expect(S().buy(A, 10_000)).toBeNull();
    expect(S().cash).toBe(STARTING_CASH);
    expect(S().holdings[A]).toBeUndefined();
    expect(S().toasts.at(-1)!.title).toBe("Not enough cash");
  });
});

describe("sell", () => {
  it("credits proceeds, realizes PnL vs average cost", () => {
    S().buy(A, 10);
    const h = S().holdings[A];
    const q = quoteSell(S().markets[A].pool, 4);
    const t = S().sell(A, 4)!;
    expect(t.kind).toBe("SELL");
    expect(t.total).toBeCloseTo(q.proceeds, 9);
    const basis = (h.cost / 10) * 4;
    expect(S().realized).toBeCloseTo(q.proceeds - basis, 9);
    expect(S().holdings[A].units).toBeCloseTo(6, 9);
    expect(S().holdings[A].cost).toBeCloseTo(h.cost - basis, 9);
  });

  it("removes holding when fully sold; round trip loses to fees", () => {
    S().buy(A, 10);
    S().sell(A, 10);
    expect(S().holdings[A]).toBeUndefined();
    expect(S().cash).toBeLessThan(STARTING_CASH);
    expect(S().realized).toBeLessThan(0);
    expect(S().cash).toBeCloseTo(STARTING_CASH + S().realized, 9);
  });

  it("rejects selling more than held, zero, or without holding", () => {
    expect(S().sell(A, 1)).toBeNull();
    S().buy(A, 2);
    expect(S().sell(A, 3)).toBeNull();
    expect(S().sell(A, 0)).toBeNull();
    expect(S().holdings[A].units).toBe(2);
  });
});

describe("oracle", () => {
  const ev = ORACLE_EVENTS.find((e) => e.id === "box-office-beat")!;

  it("applies event deltas, recomputes EPI, adds momentum, feed and toast", () => {
    const m0 = S().markets[A];
    S().oracle(A, ev.id);
    const m = S().markets[A];
    expect(m.epiParts.boxOffice).toBe(Math.min(100, m0.epiParts.boxOffice + 14));
    expect(m.epi).toBe(computeEpi(m.epiParts));
    expect(m.epiHistory.at(-1)!.value).toBe(m.epi);
    expect(m.metricValue).toBeCloseTo(m0.metricValue * ev.metricMult, 6);
    if (m.epi > m0.epi) expect(m.momentum).toBeGreaterThan(0);
    expect(m.lastEventAt).toBeDefined();
    expect(S().feed[0]).toMatchObject({ type: "oracle", refId: A, tag: ev.label });
    expect(S().toasts.at(-1)!.title).toContain("Oracle update");
  });

  it("clamps parts to [1, 100]", () => {
    for (let i = 0; i < 10; i++) S().oracle(A, "critics-pan");
    expect(S().markets[A].epiParts.critics).toBe(1);
    for (let i = 0; i < 10; i++) S().oracle(A, "viral-trailer");
    expect(S().markets[A].epiParts.social).toBe(100);
  });

  it("negative event gives negative momentum", () => {
    S().oracle(A, "box-office-miss");
    expect(S().markets[A].momentum).toBeLessThan(0);
    expect(S().feed[0].tone).toBe("down");
  });

  it("nudges linked prediction momentum by sensitivity", () => {
    const aid = linkedPred.assetId!;
    S().oracle(aid, "streaming-top");
    const dir = Math.sign(S().predictions[linkedPred.id].momentum);
    expect(dir).toBe(linkedPred.sensitivity);
  });

  it("ignores unknown asset/event", () => {
    const before = S().markets;
    S().oracle("nope", ev.id);
    S().oracle(A, "nope");
    expect(S().markets).toBe(before);
  });

  it("calls the oracle API and stores the NEAR tx when it succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hash: "HASH123456789", epi: 70, from: 69 }) });
    vi.stubGlobal("fetch", fetchMock);
    S().oracle(A, ev.id);
    await vi.waitFor(() => expect(S().markets[A].oracleTx).toBe("HASH123456789"));
    expect(fetchMock).toHaveBeenCalledWith("/api/oracle", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ assetId: A, eventId: ev.id });
    expect(S().feed[0]).toMatchObject({ type: "chain", href: "https://testnet.nearblocks.io/txns/HASH123456789" });
  });

  it("survives oracle API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    S().oracle(A, ev.id);
    await Promise.resolve();
    expect(S().markets[A].oracleTx).toBeUndefined();
  });

  it("randomOracle fires an event on a real asset", () => {
    const id = S().randomOracle();
    expect(ASSET_BY_ID[id]).toBeDefined();
    expect(S().feed[0].type).toBe("oracle");
  });
});

describe("tick", () => {
  it("keeps every price positive, grows volume, and drains momentum", () => {
    useMarket.setState({ markets: { ...S().markets, [A]: { ...S().markets[A], momentum: 0.1 } } });
    const vol0 = S().markets[A].volume24h;
    for (let i = 0; i < 200; i++) S().tick();
    expect(Math.abs(S().markets[A].momentum)).toBeLessThan(0.0004 + 1e-12);
    expect(S().markets[A].volume24h).toBeGreaterThan(vol0);
    for (const a of ASSETS) expect(priceOf(S().markets[a.id])).toBeGreaterThan(0);
  });

  it("keeps prediction probs in [0.03, 0.97] and skips resolved markets", () => {
    S().resolve(P, "YES");
    const resolvedPool = S().predictions[P].pool;
    for (let i = 0; i < 300; i++) S().tick();
    expect(S().predictions[P].pool).toBe(resolvedPool);
    for (const p of PREDICTIONS) {
      if (p.id === P) continue;
      const y = yesPrice(S().predictions[p.id].pool);
      expect(y).toBeGreaterThanOrEqual(0.03 - 1e-9);
      expect(y).toBeLessThanOrEqual(0.97 + 1e-9);
    }
  });

  it("appends candles into the current bucket", () => {
    const n = S().candles[A].length;
    S().tick();
    S().tick();
    const c = S().candles[A];
    expect(c.length === n || c.length === n + 1).toBe(true);
    const last = c.at(-1)!;
    expect(last.close).toBeCloseTo(priceOf(S().markets[A]), 9);
    expect(last.high).toBeGreaterThanOrEqual(last.close);
    expect(last.low).toBeLessThanOrEqual(last.close);
  });

  it("caps candle history at 400", () => {
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 420; i++) {
      vi.setSystemTime((now + i * 15) * 1000);
      S().tick();
    }
    expect(S().candles[A].length).toBe(400);
  });
});

describe("predict / resolve", () => {
  it("predict debits cash, creates a position, moves price", () => {
    const st = S().predictions[P];
    const q = quoteBinary(st.pool, "YES", 50);
    const t = S().predict(P, "YES", 50)!;
    expect(t).toMatchObject({ kind: "YES", refId: P, total: 50 });
    expect(t.qty).toBeCloseTo(q.shares, 9);
    expect(S().cash).toBe(STARTING_CASH - 50);
    expect(S().positions).toEqual([{ marketId: P, side: "YES", shares: q.shares, cost: 50 }]);
    expect(yesPrice(S().predictions[P].pool)).toBeGreaterThan(yesPrice(st.pool));
    expect(S().predictions[P].volume).toBe(st.volume + 50);
  });

  it("merges same-side positions, keeps sides separate", () => {
    S().predict(P, "YES", 10);
    S().predict(P, "YES", 10);
    S().predict(P, "NO", 5);
    expect(S().positions).toHaveLength(2);
    expect(S().positions.find((p) => p.side === "YES")!.cost).toBe(20);
  });

  it("rejects overspend, zero, unknown and resolved markets", () => {
    expect(S().predict(P, "YES", STARTING_CASH + 1)).toBeNull();
    expect(S().toasts.at(-1)!.title).toBe("Not enough cash");
    expect(S().predict(P, "YES", 0)).toBeNull();
    expect(S().predict("nope", "YES", 1)).toBeNull();
    S().resolve(P, "NO");
    expect(S().predict(P, "YES", 1)).toBeNull();
    expect(S().cash).toBe(STARTING_CASH);
  });

  it("resolve pays winning shares $1 each, records PnL, clears positions", () => {
    S().predict(P, "YES", 40);
    S().predict(P, "NO", 10);
    const yesShares = S().positions.find((p) => p.side === "YES")!.shares;
    const cashBefore = S().cash;
    S().resolve(P, "YES");
    expect(S().cash).toBeCloseTo(cashBefore + yesShares, 9);
    expect(S().realized).toBeCloseTo(yesShares - 50, 9);
    expect(S().positions).toEqual([]);
    expect(S().predictions[P]).toMatchObject({ resolved: "YES", momentum: 0 });
    expect(S().trades[0]).toMatchObject({ kind: "PAYOUT", qty: yesShares, price: 1 });
    expect(S().feed[0].type).toBe("settle");
    expect(S().toasts.at(-1)!.title).toBe("Market settled YES");
  });

  it("losing side expires worthless with no PAYOUT trade", () => {
    S().predict(P, "NO", 30);
    const n = S().trades.length;
    S().resolve(P, "YES");
    expect(S().realized).toBeCloseTo(-30, 9);
    expect(S().trades).toHaveLength(n);
    expect(S().toasts.at(-1)!.body).toMatch(/worthless/);
  });

  it("resolve is idempotent and silent with no positions", () => {
    S().resolve(P, "YES");
    const toasts = S().toasts.length;
    S().resolve(P, "NO");
    expect(S().predictions[P].resolved).toBe("YES");
    expect(S().toasts.length).toBe(toasts);
  });

  it("leaves other markets' positions alone", () => {
    const other = PREDICTIONS[1].id;
    S().predict(other, "YES", 5);
    S().resolve(P, "YES");
    expect(S().positions).toHaveLength(1);
  });
});

describe("misc actions", () => {
  it("setTradeSig / setTradeNear patch only the target trade", () => {
    const a = S().buy(A, 1)!;
    const b = S().buy(A, 1)!;
    S().setTradeSig(a.id, { sig: "s", sigStatus: "confirmed" });
    S().setTradeNear(a.id, { nearTx: "n", nearStatus: "pending" });
    const ta = S().trades.find((t) => t.id === a.id)!;
    const tb = S().trades.find((t) => t.id === b.id)!;
    expect(ta).toMatchObject({ sig: "s", sigStatus: "confirmed", nearTx: "n", nearStatus: "pending" });
    expect(tb.sig).toBeUndefined();
  });

  it("setChains merges", () => {
    S().setChains({ near: false });
    expect(S().chains).toEqual({ solana: true, near: false });
  });

  it("toasts cap at 4 and auto-dismiss after 5.2s", () => {
    for (let i = 0; i < 6; i++) S().toast({ title: `t${i}`, tone: "neutral" });
    expect(S().toasts.map((t) => t.title)).toEqual(["t2", "t3", "t4", "t5"]);
    vi.advanceTimersByTime(5200);
    expect(S().toasts).toEqual([]);
  });

  it("dismissToast removes one", () => {
    S().toast({ title: "a", tone: "up" });
    S().toast({ title: "b", tone: "up" });
    S().dismissToast(S().toasts[0].id);
    expect(S().toasts.map((t) => t.title)).toEqual(["b"]);
  });

  it("feed is capped at 60 items", () => {
    for (let i = 0; i < 70; i++) S().oracle(A, "viral-trailer");
    expect(S().feed.length).toBe(60);
  });

  it("reset restores cash, clears portfolio, rebuilds candles", () => {
    S().buy(A, 5);
    S().predict(P, "YES", 10);
    S().reset();
    expect(S().cash).toBe(STARTING_CASH);
    expect(S().holdings).toEqual({});
    expect(S().positions).toEqual([]);
    expect(S().trades).toEqual([]);
    expect(S().realized).toBe(0);
    expect(Object.keys(S().candles).length).toBe(ASSETS.length);
  });
});

describe("persistence", () => {
  it("persists only durable fields to localStorage", async () => {
    S().buy(A, 1);
    const raw = localStorage.getItem("entx-tmdb-v3");
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!).state;
    expect(saved).toHaveProperty("cash");
    expect(saved).toHaveProperty("holdings");
    expect(saved).not.toHaveProperty("candles");
    expect(saved).not.toHaveProperty("toasts");
  });

  it("rehydrates saved state", async () => {
    S().buy(A, 3);
    const cash = S().cash;
    useMarket.setState({ cash: 1, holdings: {} });
    // restore what was saved before the in-memory tamper
    localStorage.setItem(
      "entx-tmdb-v3",
      JSON.stringify({ state: { ...JSON.parse(localStorage.getItem("entx-tmdb-v3")!).state, cash, holdings: { [A]: { units: 3, cost: 1 } } }, version: 0 }),
    );
    await useMarket.persist.rehydrate();
    expect(S().cash).toBe(cash);
    expect(S().holdings[A].units).toBe(3);
  });
});

describe("portfolioValue / change24h", () => {
  it("is just cash when empty", () => {
    expect(portfolioValue(S())).toEqual({ holdings: 0, preds: 0, unrealized: 0, total: STARTING_CASH });
  });

  it("marks holdings and positions to market", () => {
    S().buy(A, 10);
    S().predict(P, "NO", 20);
    const v = portfolioValue(S());
    const price = priceOf(S().markets[A]);
    expect(v.holdings).toBeCloseTo(10 * price, 9);
    const pos = S().positions[0];
    expect(v.preds).toBeCloseTo(pos.shares * (1 - yesPrice(S().predictions[P].pool)), 9);
    expect(v.total).toBeCloseTo(S().cash + v.holdings + v.preds, 9);
    expect(v.unrealized).toBeCloseTo(v.holdings - S().holdings[A].cost + v.preds - 20, 9);
  });

  it("change24h compares to ref24h", () => {
    const m = { ...S().markets[A], ref24h: priceOf(S().markets[A]) / 1.1 };
    expect(change24h(m)).toBeCloseTo(0.1, 9);
  });
});
