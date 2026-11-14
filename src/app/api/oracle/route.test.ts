// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSETS, EPI_WEIGHTS, ORACLE_EVENTS, computeEpi, type EpiParts } from "@/lib/assets";

const callFunctionRaw = vi.fn();
vi.mock("near-api-js", () => ({
  JsonRpcProvider: vi.fn(function () {}),
  Account: vi.fn(function (this: Record<string, unknown>) {
    this.callFunctionRaw = callFunctionRaw;
  }),
}));

const A = ASSETS[0].id;
const B = ASSETS[1].id;

/** Expected absolute EPI: the title's seeded parts + one event's deltas, each part clamped to [1, 100]. */
function expectedEpi(assetIndex: number, eventId: string) {
  const parts = { ...ASSETS[assetIndex].epiParts };
  const ev = ORACLE_EVENTS.find((e) => e.id === eventId)!;
  for (const [k, d] of Object.entries(ev.delta) as [keyof EpiParts, number][]) {
    parts[k] = Math.max(1, Math.min(100, parts[k] + d));
  }
  return Math.round(computeEpi(parts) * 10) / 10;
}
const chainEpi = (epi_x10: number) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ result: { result: encode({ epi_x10 }) } }) }));
const encode = (v: unknown) => Array.from(new TextEncoder().encode(JSON.stringify(v)));

async function load() {
  vi.resetModules();
  return import("./route");
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/oracle", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const auth = { authorization: "Bearer s3cret" };

beforeEach(() => {
  vi.stubEnv("NEAR_ORACLE_ACCOUNT", "oracle.testnet");
  vi.stubEnv("NEAR_ORACLE_PRIVATE_KEY", "ed25519:abc");
  vi.stubEnv("ORACLE_API_SECRET", "s3cret");
  vi.stubEnv("ENTX_PUBLIC_ORACLE", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("TRUST_PROXY", "");
  callFunctionRaw.mockReset().mockResolvedValue({ transaction: { hash: "TXHASH" } });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: async () => ({ result: { result: encode({ epi_x10: 650 }) } }) }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GET /api/oracle", () => {
  it("reports config and event impacts", async () => {
    const { GET } = await load();
    const json = await (await GET()).json();
    expect(json.enabled).toBe(true);
    expect(json.publicDemo).toBe(false);
    expect(json.oracle).toBe("oracle.testnet");
    expect(json.events).toHaveLength(ORACLE_EVENTS.length);
    const beat = json.events.find((e: { id: string }) => e.id === "box-office-beat");
    expect(beat.impact).toBeCloseTo(14 * EPI_WEIGHTS.boxOffice + 6 * EPI_WEIGHTS.social, 9);
  });

  it("enabled=false without signer", async () => {
    vi.stubEnv("NEAR_ORACLE_PRIVATE_KEY", "");
    const { GET } = await load();
    expect((await (await GET()).json()).enabled).toBe(false);
  });
});

describe("POST /api/oracle", () => {
  it("503 when signer not configured", async () => {
    vi.stubEnv("NEAR_ORACLE_ACCOUNT", "");
    const { POST } = await load();
    expect((await POST(req({}, auth))).status).toBe(503);
  });

  it("401 without bearer secret and public demo off", async () => {
    const { POST } = await load();
    expect((await POST(req({ assetId: A, eventId: "viral-trailer" }))).status).toBe(401);
    expect((await POST(req({ assetId: A, eventId: "viral-trailer" }, { authorization: "Bearer wrong" }))).status).toBe(401);
  });

  it("400 on invalid JSON, unknown asset or event", async () => {
    const { POST } = await load();
    expect((await POST(req("{not json", auth))).status).toBe(400);
    expect((await POST(req({ assetId: "nope", eventId: "viral-trailer" }, auth))).status).toBe(400);
    expect((await POST(req({ assetId: A, eventId: "nope" }, auth))).status).toBe(400);
  });

  it("signs report_epi with a server-computed absolute value (clients cannot choose it)", async () => {
    const { POST } = await load();
    const res = await POST(req({ assetId: A, eventId: "box-office-beat", epi: 100 }, auth));
    expect(res.status).toBe(200);
    const json = await res.json();
    const expected = expectedEpi(0, "box-office-beat");
    expect(json).toEqual({
      hash: "TXHASH",
      oracle: "oracle.testnet",
      from: 65,
      epi: expected,
      baseline: computeEpi(ASSETS[0].epiParts),
    });
    expect(callFunctionRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        methodName: "report_epi",
        args: { market_id: A, epi_x10: Math.round(expected * 10), note: "Box office beats forecast" },
      }),
    );
  });

  it("anchors to the seeded baseline, never to the current chain value", async () => {
    vi.useFakeTimers();
    const { POST } = await load();
    const expected = expectedEpi(0, "viral-trailer");
    // A chain already pinned at the cap (the old cumulative drift) does not push the value further.
    for (const onChain of [995, 1000, 120, Math.round(expected * 10)]) {
      chainEpi(onChain);
      vi.advanceTimersByTime(300);
      const json = await (await POST(req({ assetId: A, eventId: "viral-trailer" }, auth))).json();
      expect(json.from).toBe(onChain / 10);
      expect(json.epi).toBe(expected);
    }
  });

  it("negative events land below the baseline, positive above, within the deviation bound", async () => {
    vi.useFakeTimers();
    const { POST } = await load();
    const baseline = computeEpi(ASSETS[1].epiParts);
    for (const e of ORACLE_EVENTS) {
      vi.advanceTimersByTime(300);
      const json = await (await POST(req({ assetId: B, eventId: e.id }, auth))).json();
      expect(json.baseline).toBe(baseline);
      expect(json.epi).toBe(expectedEpi(1, e.id));
      expect(Math.abs(json.epi - baseline)).toBeLessThanOrEqual(15);
      expect(json.epi).toBeGreaterThanOrEqual(1);
      expect(json.epi).toBeLessThanOrEqual(100);
      const impact = (Object.entries(e.delta) as [keyof EpiParts, number][]).reduce((t, [k, d]) => t + EPI_WEIGHTS[k] * d, 0);
      expect(Math.sign(json.epi - baseline)).toBe(Math.sign(impact));
    }
  });

  it("404 when market not registered on-chain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ result: { result: encode(null) } }) }));
    const { POST } = await load();
    expect((await POST(req({ assetId: A, eventId: "viral-trailer" }, auth))).status).toBe(404);
  });

  it("502 with truncated message when signing fails", async () => {
    callFunctionRaw.mockRejectedValue(new Error("x".repeat(500)));
    const { POST } = await load();
    const res = await POST(req({ assetId: A, eventId: "viral-trailer" }, auth));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toHaveLength(200);
  });

  it("rate-limits authenticated callers at 250ms", async () => {
    vi.useFakeTimers();
    const { POST } = await load();
    const body = { assetId: A, eventId: "viral-trailer" };
    expect((await POST(req(body, auth))).status).toBe(200);
    expect((await POST(req(body, auth))).status).toBe(429);
    vi.advanceTimersByTime(260);
    expect((await POST(req(body, auth))).status).toBe(200);
  });

  describe("public demo mode", () => {
    beforeEach(() => vi.stubEnv("ENTX_PUBLIC_ORACLE", "true"));
    const body = { assetId: A, eventId: "viral-trailer" };

    it("accepts same-origin browser requests, rejects cross-origin and missing origin", async () => {
      const { POST } = await load();
      expect((await POST(req(body, { origin: "https://evil.example" }))).status).toBe(401);
      expect((await POST(req(body))).status).toBe(401);
      expect((await POST(req(body, { origin: "not a url" }))).status).toBe(401);
      expect((await POST(req(body, { origin: "http://localhost:3000" }))).status).toBe(200);
    });

    it("applies global 1.5s limit and shared per-IP limit without trusted proxy", async () => {
      vi.useFakeTimers();
      const { POST } = await load();
      const o = { origin: "http://localhost:3000" };
      expect((await POST(req(body, o))).status).toBe(200);
      vi.advanceTimersByTime(2000);
      // global window passed but shared per-IP bucket (6s) still blocks
      expect((await POST(req({ ...body, assetId: B }, o))).status).toBe(429);
      vi.advanceTimersByTime(4100);
      expect((await POST(req({ ...body, assetId: B }, o))).status).toBe(200);
    });

    it("allows one publish per title per 60s, other titles unaffected", async () => {
      vi.useFakeTimers();
      vi.stubEnv("TRUST_PROXY", "true");
      const { POST } = await load();
      const o = { origin: "http://localhost:3000" };
      expect((await POST(req(body, { ...o, "x-real-ip": "1.1.1.1" }))).status).toBe(200);
      vi.advanceTimersByTime(10_000);
      expect((await POST(req(body, { ...o, "x-real-ip": "2.2.2.2" }))).status).toBe(429);
      expect((await POST(req({ ...body, assetId: B }, { ...o, "x-real-ip": "2.2.2.2" }))).status).toBe(200);
      vi.advanceTimersByTime(50_100);
      expect((await POST(req(body, { ...o, "x-real-ip": "3.3.3.3" }))).status).toBe(200);
    });

    it("behind trusted proxy, different IPs only hit the global limit", async () => {
      vi.useFakeTimers();
      vi.stubEnv("TRUST_PROXY", "true");
      const { POST } = await load();
      const o = { origin: "http://localhost:3000" };
      expect((await POST(req(body, { ...o, "x-real-ip": "1.1.1.1" }))).status).toBe(200);
      expect((await POST(req(body, { ...o, "x-real-ip": "2.2.2.2" }))).status).toBe(429); // global 1.5s
      vi.advanceTimersByTime(1600);
      expect((await POST(req({ ...body, assetId: B }, { ...o, "x-forwarded-for": "3.3.3.3, 9.9.9.9" }))).status).toBe(200);
      vi.advanceTimersByTime(1600);
      // 1.1.1.1 is still inside its own 6s per-IP window
      expect((await POST(req({ ...body, assetId: ASSETS[2].id }, { ...o, "x-real-ip": "1.1.1.1" }))).status).toBe(429);
    });

    it("demo spam does not starve the authenticated bucket", async () => {
      vi.useFakeTimers();
      const { POST } = await load();
      expect((await POST(req(body, { origin: "http://localhost:3000" }))).status).toBe(200);
      expect((await POST(req(body, auth))).status).toBe(200);
    });

    it("caps demo publishes at 240 per hour", async () => {
      vi.useFakeTimers();
      vi.stubEnv("TRUST_PROXY", "true");
      const { POST } = await load();
      let ok = 0;
      // Rotate titles so each is revisited only after its 60s per-title window, all inside one hour.
      const step = Math.max(1600, Math.ceil(60_100 / ASSETS.length));
      for (let i = 0; i < 245; i++) {
        vi.advanceTimersByTime(step);
        const assetId = ASSETS[i % ASSETS.length].id;
        const r = await POST(req({ ...body, assetId }, { origin: "http://localhost:3000", "x-real-ip": `10.0.0.${i}` }));
        if (r.status === 200) ok++;
      }
      expect(ok).toBe(240);
    });
  });
});
