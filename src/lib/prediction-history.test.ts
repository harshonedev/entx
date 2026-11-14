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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useProbHistory", () => {
  it("backfills an hour ending at the current probability after hydration", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    const { result } = renderHook(() => useProbHistory(P));
    const s = result.current;
    expect(s).toHaveLength(240);
    expect(s.at(-1)!.value).toBeCloseTo(yesPrice(useMarket.getState().predictions[P].pool), 12);
    expect(s.at(-1)!.time).toBe(Math.floor(Date.now() / 1000));
    for (let i = 1; i < s.length; i++) expect(s[i].time - s[i - 1].time).toBe(15);
    for (const p of s) {
      expect(p.value).toBeGreaterThanOrEqual(0.03);
      expect(p.value).toBeLessThanOrEqual(0.97);
    }
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
    vi.setSystemTime(new Date("2026-11-14T12:00:05Z"));
    act(() => {
      useMarket.getState().predict(P, "YES", 100);
    });
    expect(result.current).not.toBe(before);
    expect(result.current).toHaveLength(241);
    expect(result.current.at(-1)!.value).toBeCloseTo(yesPrice(useMarket.getState().predictions[P].pool), 12);
  });

  it("replaces the last point when updated within the same second", async () => {
    const { useMarket, useProbHistory } = await load();
    await useMarket.persist.rehydrate();
    const { result } = renderHook(() => useProbHistory(P));
    act(() => {
      useMarket.getState().predict(P, "YES", 50);
    });
    expect(result.current).toHaveLength(240);
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
