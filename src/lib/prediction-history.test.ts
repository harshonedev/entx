import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PREDICTIONS } from "./predictions";
import { yesPrice } from "./engine";

// The module keeps a module-level series map; import fresh per test.
async function load() {
  vi.resetModules();
  const store = await import("@/store/market");
  const hist = await import("./prediction-history");
  return { useMarket: store.useMarket, useProbHistory: hist.useProbHistory };
}

const P = PREDICTIONS[0].id;

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useProbHistory", () => {
  it("back-fills a modelled 24h lead-in from the linked title's EPI, not from noise", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    const { result } = renderHook(() => useProbHistory(P));
    const s = result.current;
    const seed = PREDICTIONS[0];
    const now = yesPrice(useMarket.getState().predictions[P].pool);
    const t = Math.floor(Date.now() / 1000);
    expect(s).toHaveLength(97);
    const lead = s.slice(0, -1);
    for (const p of lead) expect(p.modelled).toBe(true);
    for (let i = 1; i < lead.length; i++) expect(s[i].time - s[i - 1].time).toBe(900);
    expect(s.at(-1)!.time - lead[0].time).toBe(24 * 3600);
    expect(s.at(-1)).toEqual({ time: t, value: now });
    // Hourly lead points sit exactly on the EPI samples: YES moves by sensitivity × 2.2 × relative EPI change.
    const epi = useMarket.getState().markets[seed.assetId!].epiHistory;
    const epi0 = epi.at(-1)!.value;
    for (const e of epi.slice(0, -1)) {
      const pt = lead.find((p) => p.time === e.time)!;
      const want = Math.min(0.98, Math.max(0.02, now + seed.sensitivity * 2.2 * ((e.value - epi0) / epi0)));
      expect(pt.value).toBeCloseTo(want, 12);
    }
    expect(new Set(lead.map((p) => p.value)).size).toBeGreaterThan(1);
  });

  it("keeps the lead-in flat for a market that has already settled", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    act(() => useMarket.getState().resolve(P, "YES"));
    const s = renderHook(() => useProbHistory(P)).result.current;
    for (const p of s.slice(0, -1)) expect(p).toMatchObject({ modelled: true, value: 1 });
  });

  it("keeps recorded points across a reload, without the modelled lead-in", async () => {
    const a = await load();
    await a.useMarket.persist.rehydrate();
    renderHook(() => a.useProbHistory(P));
    vi.setSystemTime(new Date("2026-11-14T12:02:00Z"));
    act(() => {
      a.useMarket.getState().predict(P, "YES", 100);
    });
    window.dispatchEvent(new Event("pagehide"));
    const recorded = a.useMarket.getState().predictions[P];

    vi.setSystemTime(new Date("2026-11-14T12:03:00Z"));
    const b = await load();
    await b.useMarket.persist.rehydrate();
    const s = renderHook(() => b.useProbHistory(P)).result.current;
    const real = s.filter((p) => !p.modelled);
    expect(real.map((p) => p.time)).toEqual([
      Math.floor(new Date("2026-11-14T12:00:00Z").getTime() / 1000),
      Math.floor(new Date("2026-11-14T12:02:00Z").getTime() / 1000),
      Math.floor(Date.now() / 1000),
    ]);
    expect(real[1].value).toBeCloseTo(yesPrice(recorded.pool), 12);
    // The lead-in ends one step before the first recorded point.
    expect(s[0].modelled).toBe(true);
    expect(s.filter((p) => p.modelled).at(-1)!.time).toBe(real[0].time - 900);
  });

  it("recordedChange ignores the lead-in and needs a minute of real data", async () => {
    const { recordedChange } = await import("./prediction-history");
    const lead = { time: 0, value: 0.9, modelled: true as const };
    expect(recordedChange([lead, { time: 100, value: 0.4 }, { time: 130, value: 0.5 }])).toBeNull();
    expect(recordedChange([lead, { time: 100, value: 0.4 }, { time: 220, value: 0.45 }])).toEqual({
      pts: expect.closeTo(5, 9),
      seconds: 120,
    });
  });

  it("backfill is deterministic per market id", async () => {
    const a = await load();
    await a.useMarket.persist.rehydrate();
    const r1 = renderHook(() => a.useProbHistory(P)).result.current.map((p) => p.value);
    const b = await load();
    await b.useMarket.persist.rehydrate();
    const r2 = renderHook(() => b.useProbHistory(P)).result.current.map((p) => p.value);
    expect(r1).toEqual(r2);
  });

  it("records a new point when the prediction pool changes, with a new array", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    const { result } = renderHook(() => useProbHistory(P));
    const before = result.current;
    // Live points are bucketed to 15s, so a change in the next bucket adds a point.
    vi.setSystemTime(new Date("2026-11-14T12:00:20Z"));
    act(() => {
      useMarket.getState().predict(P, "YES", 100);
    });
    expect(result.current).not.toBe(before);
    expect(result.current).toHaveLength(98);
    expect(result.current.at(-1)!.value).toBeCloseTo(yesPrice(useMarket.getState().predictions[P].pool), 12);
  });

  it("replaces the last point when updated within the same 15s bucket", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    const { result } = renderHook(() => useProbHistory(P));
    act(() => {
      useMarket.getState().predict(P, "YES", 50);
    });
    expect(result.current).toHaveLength(97);
    expect(result.current.at(-1)!.value).toBeCloseTo(yesPrice(useMarket.getState().predictions[P].pool), 12);
  });

  it("resolved markets plot at 1 (YES) or 0 (NO)", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    const { result } = renderHook(() => useProbHistory(P));
    vi.setSystemTime(new Date("2026-11-14T12:01:00Z"));
    act(() => useMarket.getState().resolve(P, "NO"));
    expect(result.current.at(-1)!.value).toBe(0);
  });

  it("returns a stable empty array for unknown ids", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    const { result, rerender } = renderHook(() => useProbHistory("nope"));
    const first = result.current;
    rerender();
    expect(first).toEqual([]);
    expect(result.current).toBe(first);
  });
});
