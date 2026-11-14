import { describe, expect, it, vi } from "vitest";
import {
  NEAR_CONTRACT,
  nearAccountUrl,
  nearToYocto,
  nearTxUrl,
  nearView,
  resolvedOutcome,
  stakingClosed,
  YOCTO,
  yoctoToNear,
} from "./near-config";

describe("yocto conversions", () => {
  it("YOCTO is 10^24", () => {
    expect(YOCTO).toBe(BigInt(10) ** BigInt(24));
  });

  it("nearToYocto converts whole and fractional NEAR", () => {
    expect(nearToYocto(1)).toBe("1000000000000000000000000");
    expect(nearToYocto(0.5)).toBe("500000000000000000000000");
    expect(nearToYocto(0)).toBe("0");
    // precision is 4 decimals
    expect(nearToYocto(0.00012)).toBe("100000000000000000000");
  });

  it("yoctoToNear formats with digits", () => {
    expect(yoctoToNear("1500000000000000000000000")).toBe("1.500");
    expect(yoctoToNear(BigInt(2) * YOCTO, 1)).toBe("2.0");
    expect(yoctoToNear("")).toBe("0.000");
    expect(yoctoToNear("1")).toBe("0.000");
  });

  it("round-trips", () => {
    for (const n of [0.1, 1.2345, 42]) expect(Number(yoctoToNear(nearToYocto(n), 4))).toBeCloseTo(n, 4);
  });
});

describe("urls", () => {
  it("builds nearblocks links", () => {
    expect(nearTxUrl("h")).toBe("https://testnet.nearblocks.io/txns/h");
    expect(nearAccountUrl("a.testnet")).toBe("https://testnet.nearblocks.io/address/a.testnet");
  });
});

describe("resolvedOutcome", () => {
  it("returns null for open, boolean for resolved", () => {
    expect(resolvedOutcome("Open")).toBeNull();
    expect(resolvedOutcome({ Resolved: { outcome: true } })).toBe(true);
    expect(resolvedOutcome({ Resolved: { outcome: false } })).toBe(false);
  });
});

describe("stakingClosed", () => {
  it("is open without a deadline (pre-deadline contracts) and before it", () => {
    expect(stakingClosed({}, 5)).toBe(false);
    expect(stakingClosed({ closes_at_ms: null }, 5)).toBe(false);
    expect(stakingClosed({ closes_at_ms: 10 }, 9)).toBe(false);
  });

  it("closes at and after the deadline, matching the contract", () => {
    expect(stakingClosed({ closes_at_ms: 10 }, 10)).toBe(true);
    expect(stakingClosed({ closes_at_ms: 10 }, 11)).toBe(true);
  });
});

describe("nearView", () => {
  const encode = (v: unknown) => Array.from(new TextEncoder().encode(JSON.stringify(v)));

  it("posts a call_function query with base64 args and decodes the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ result: { result: encode({ ok: 1 }) } }) });
    vi.stubGlobal("fetch", fetchMock);
    const out = await nearView<{ ok: number }>("get_market", { market_id: "x" });
    expect(out).toEqual({ ok: 1 });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.method).toBe("query");
    expect(body.params.account_id).toBe(NEAR_CONTRACT);
    expect(body.params.method_name).toBe("get_market");
    expect(JSON.parse(atob(body.params.args_base64))).toEqual({ market_id: "x" });
    vi.unstubAllGlobals();
  });

  it("throws on rpc error and on result error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ error: { code: 1 } }) }));
    await expect(nearView("m")).rejects.toThrow('{"code":1}');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ result: { error: "boom" } }) }));
    await expect(nearView("m")).rejects.toThrow("boom");
    vi.unstubAllGlobals();
  });
});
