import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSETS } from "@/lib/assets";

// The store keeps throttle state at module level, so each "page load" imports it fresh.
async function load() {
  vi.resetModules();
  return (await import("./market")).useMarket;
}

const A = ASSETS[0].id;

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("candle history persistence", () => {
  it("flags generated lead-in candles as modelled", async () => {
    const useMarket = await load();
    useMarket.getState().ensureHistory();
    const list = useMarket.getState().candles[A];
    expect(list.length).toBeGreaterThan(100);
    expect(list.every((k) => k.modelled)).toBe(true);
  });

  it("keeps the same past after a reload instead of redrawing it", async () => {
    const first = await load();
    first.getState().ensureHistory();
    vi.setSystemTime(new Date("2026-11-14T12:00:20Z"));
    first.getState().tick(); // a live candle, and the first save
    const before = first.getState().candles[A];
    expect(before.at(-1)!.modelled).toBeUndefined();

    vi.setSystemTime(new Date("2026-11-14T13:30:00Z")); // a new hour would reseed a generated history
    const second = await load();
    second.getState().ensureHistory();
    expect(second.getState().candles[A]).toEqual(before);
  });

  it("reset forgets saved candles", async () => {
    const useMarket = await load();
    useMarket.getState().ensureHistory();
    vi.setSystemTime(new Date("2026-11-14T12:00:20Z"));
    useMarket.getState().tick();
    useMarket.getState().reset();
    expect(window.localStorage.getItem("entx:candles:v1")).toBeNull();
    expect(useMarket.getState().candles[A].every((k) => k.modelled)).toBe(true);
  });
});
