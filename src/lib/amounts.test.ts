import { describe, expect, it } from "vitest";
import { defaultAmount } from "./amounts";

describe("defaultAmount", () => {
  it("offers the preferred amount when cash covers it", () => {
    expect(defaultAmount(1000)).toBe(25);
    expect(defaultAmount(25, [10, 25, 50])).toBe(25);
  });
  it("free entry falls back to whole dollars of cash, or 0", () => {
    expect(defaultAmount(10.98)).toBe(10);
    expect(defaultAmount(0.4)).toBe(0);
  });
  it("presets fall back to the largest one cash covers, else the smallest", () => {
    expect(defaultAmount(12, [10, 25, 50, 100])).toBe(10);
    expect(defaultAmount(5, [10, 25, 50, 100])).toBe(10);
  });
});
