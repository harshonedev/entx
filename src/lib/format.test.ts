import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compact, compactUsd, explorerTx, metricText, num, pct, shortKey, timeAgo, usd } from "./format";

describe("usd", () => {
  it("formats with 2 digits and thousands separators", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd(0)).toBe("$0.00");
  });
  it("puts the minus sign before the dollar sign", () => {
    expect(usd(-12.3)).toBe("-$12.30");
  });
  it("drops the sign when the value rounds to zero", () => {
    expect(usd(-0.003)).toBe("$0.00");
    expect(usd(-0.006)).toBe("-$0.01");
  });
  it("respects custom digits", () => {
    expect(usd(1.23456, 4)).toBe("$1.2346");
    expect(usd(99.9, 0)).toBe("$100");
  });
});

describe("compact / compactUsd", () => {
  it("uses compact notation", () => {
    expect(compact(1500)).toBe("1.5K");
    expect(compact(1_804_356_298)).toBe("1.8B");
    expect(compact(12)).toBe("12");
    expect(compactUsd(2_500_000)).toBe("$2.5M");
  });
});

describe("pct", () => {
  it("adds + for non-negative and formats fraction as percent", () => {
    expect(pct(0.1234)).toBe("+12.34%");
    expect(pct(-0.05, 1)).toBe("-5.0%");
  });
  it("prints values that round to zero as an unsigned zero", () => {
    expect(pct(0)).toBe("0.00%");
    expect(pct(-0, 1)).toBe("0.0%");
    expect(pct(-0.0004, 1)).toBe("0.0%");
    expect(pct(0.0004, 1)).toBe("0.0%");
    expect(pct(-0.00004)).toBe("0.00%");
    // Just past the rounding threshold keeps its sign.
    expect(pct(-0.0006, 1)).toBe("-0.1%");
    expect(pct(0.0006, 1)).toBe("+0.1%");
  });
});

describe("num", () => {
  it("fixes digits with separators", () => {
    expect(num(1234.567)).toBe("1,234.57");
    expect(num(3, 0)).toBe("3");
  });
});

describe("metricText", () => {
  it("handles each unit", () => {
    expect(metricText({ value: 2_000_000, unit: "usd" })).toBe("$2M");
    expect(metricText({ value: 45_000, unit: "views" })).toBe("45K");
    expect(metricText({ value: 87.6, unit: "pct" })).toBe("88/100");
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const now = () => Date.now();
  it.each([
    [0, "0s ago"],
    [59_000, "59s ago"],
    [60_000, "1m ago"],
    [3_599_000, "59m ago"],
    [3_600_000, "1h ago"],
    [86_399_000, "23h ago"],
    [86_400_000, "1d ago"],
    [5 * 86_400_000, "5d ago"],
  ])("%i ms ago -> %s", (ms, out) => {
    expect(timeAgo(now() - ms)).toBe(out);
  });

  it("clamps future timestamps to 0s", () => {
    expect(timeAgo(now() + 10_000)).toBe("0s ago");
  });
});

describe("shortKey / explorerTx", () => {
  it("shortens keys", () => {
    expect(shortKey("ABCDEFGHIJKLMNOP")).toBe("ABCD…MNOP");
  });
  it("links to devnet explorer", () => {
    expect(explorerTx("sig123")).toBe("https://explorer.solana.com/tx/sig123?cluster=devnet");
  });
});
