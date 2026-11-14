// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const SOL = "nep141:sol.omft.near";
const USDC_SOL = "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";
const ETH = "nep141:eth.omft.near";

// The route rate-limits per IP and globally.
let clock = Date.now();
/** Builds a request without moving the clock (for rate-limit tests). */
const reqNow = (body: unknown) =>
  new Request("http://localhost/api/intents/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
/** Builds a request one minute after the previous one, past every rate-limit window. */
const req = (body: unknown) => {
  if (vi.isFakeTimers()) vi.setSystemTime((clock += 60_000));
  return reqNow(body);
};

let fetchMock: ReturnType<typeof vi.fn>;
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((clock += 60_000));
  vi.stubEnv("ONECLICK_JWT", "");
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ quote: { amountOut: "123" }, timestamp: "t" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/intents/quote", () => {
  it("400 without calling 1Click when the amount rounds to zero base units", async () => {
    const res = await POST(req({ originAsset: SOL, amount: 1e-30 }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON", async () => {
    expect((await POST(req("{"))).status).toBe(400);
  });

  it.each([
    [{ originAsset: "nep141:unknown", amount: 1 }],
    [{ originAsset: SOL }],
    [{ originAsset: SOL, amount: 0 }],
    [{ originAsset: SOL, amount: -1 }],
    [{ originAsset: SOL, amount: 1e8 }],
    [{ originAsset: SOL, amount: "abc" }],
    [{ amount: 1 }],
  ])("400 on unsupported asset/amount %j", async (body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("always requests a dry EXACT_INPUT quote into USDC on NEAR", async () => {
    const res = await POST(req({ originAsset: SOL, amount: 1.5 }));
    expect(res.status).toBe(200);
    const b = sent();
    expect(b.dry).toBe(true);
    expect(b.swapType).toBe("EXACT_INPUT");
    expect(b.destinationAsset).toMatch(/^nep141:/);
    expect(fetchMock.mock.calls[0][0]).toBe("https://1click.chaindefuser.com/v0/quote");
    expect(await res.json()).toMatchObject({ dry: true, quote: { amountOut: "123" }, recipient: "intents.near", authenticated: false });
  });

  it("converts amount to base units using origin decimals", async () => {
    await POST(req({ originAsset: SOL, amount: 1.5 }));
    expect(sent().amount).toBe("1500000000");
    fetchMock.mockClear();
    await POST(req({ originAsset: USDC_SOL, amount: 2.25 }));
    expect(sent().amount).toBe("2250000");
    fetchMock.mockClear();
    await POST(req({ originAsset: ETH, amount: 0.1 }));
    expect(sent().amount).toBe("100000000000000000");
  });

  it("only uses mainnet .near recipients", async () => {
    await POST(req({ originAsset: SOL, amount: 1, recipient: "bob.near" }));
    expect(sent().recipient).toBe("bob.near");
    fetchMock.mockClear();
    await POST(req({ originAsset: SOL, amount: 1, recipient: "bob.testnet" }));
    expect(sent().recipient).toBe("intents.near");
  });

  it("uses a valid Solana refund address only for Solana origins", async () => {
    const pk = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    await POST(req({ originAsset: SOL, amount: 1, refundTo: pk }));
    expect(sent().refundTo).toBe(pk);
    fetchMock.mockClear();
    await POST(req({ originAsset: SOL, amount: 1, refundTo: "0OIl-bad" }));
    expect(sent().refundTo).toBe("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    fetchMock.mockClear();
    await POST(req({ originAsset: ETH, amount: 1, refundTo: pk }));
    expect(sent().refundTo).toBe("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  });

  it("forwards ONECLICK_JWT when set", async () => {
    vi.stubEnv("ONECLICK_JWT", "jwt");
    const res = await POST(req({ originAsset: SOL, amount: 1 }));
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer jwt");
    expect((await res.json()).authenticated).toBe(true);
  });

  it("502 with upstream message when 1Click fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: "slow down", correlationId: "c1" }) });
    const res = await POST(req({ originAsset: SOL, amount: 1 }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "slow down", correlationId: "c1" });
  });

  it("502 with status when upstream returns non-JSON", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("html"); } });
    const res = await POST(req({ originAsset: SOL, amount: 1 }));
    expect((await res.json()).error).toBe("1Click returned 500");
  });

  it("502 when ok but no quote", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    expect((await POST(req({ originAsset: SOL, amount: 1 }))).status).toBe(502);
  });

  it("rate-limits repeat callers", async () => {
    expect((await POST(reqNow({ originAsset: SOL, amount: 1 }))).status).toBe(200);
    expect((await POST(reqNow({ originAsset: SOL, amount: 1 }))).status).toBe(429);
  });

  it("rejects oversized bodies and inherited asset keys", async () => {
    expect((await POST(req({ originAsset: SOL, amount: 1, pad: "x".repeat(5_000) }))).status).toBe(400);
    expect((await POST(req({ originAsset: "constructor", amount: 1 }))).status).toBe(400);
    expect((await POST(req({ originAsset: "__proto__", amount: 1 }))).status).toBe(400);
  });

  it("504 when 1Click times out", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect((await POST(req({ originAsset: SOL, amount: 1 }))).status).toBe(504);
  });
});
