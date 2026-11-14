import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("./env");
};

afterEach(() => vi.unstubAllEnvs());

describe("env", () => {
  it("defaults to demo on NEAR with the chain switch hidden", async () => {
    const env = await load({ NEXT_PUBLIC_ENTX_MODE: "", NEXT_PUBLIC_CHAIN: "", NEXT_PUBLIC_FLAG_CHAIN_SWITCH: "" });
    expect(env.MODE).toBe("demo");
    expect(env.CHAIN).toBe("near");
    expect(env.FLAGS.chainSwitch).toBe(false);
  });

  it("ignores unknown values instead of trusting them", async () => {
    const env = await load({ NEXT_PUBLIC_ENTX_MODE: "prod", NEXT_PUBLIC_CHAIN: "eth", NEXT_PUBLIC_FLAG_CHAIN_SWITCH: "1" });
    expect(env.MODE).toBe("demo");
    expect(env.CHAIN).toBe("near");
    expect(env.FLAGS.chainSwitch).toBe(false);
  });

  it("reads live mode, Solana and the flag", async () => {
    const env = await load({ NEXT_PUBLIC_ENTX_MODE: "live", NEXT_PUBLIC_CHAIN: "solana", NEXT_PUBLIC_FLAG_CHAIN_SWITCH: "true" });
    expect(env.IS_LIVE).toBe(true);
    expect(env.CHAIN).toBe("solana");
    expect(env.FLAGS.chainSwitch).toBe(true);
  });

  it("links each deployment to its counterpart", async () => {
    const env = await load({ NEXT_PUBLIC_URL_NEAR_LIVE: "", NEXT_PUBLIC_URL_NEAR_DEMO: "", NEXT_PUBLIC_URL_SOLANA: "" });
    expect(env.otherModeUrl("demo", "near")).toBe("https://entx.space");
    expect(env.otherModeUrl("live", "near")).toBe("https://demo.entx.space");
    // Solana has no live site until M3: its live link is NEAR live.
    expect(env.otherModeUrl("demo", "solana")).toBe("https://entx.space");
    expect(env.chainUrl("solana")).toBe("https://solana.entx.space");
    expect(env.chainUrl("near")).toBe("https://entx.space");
  });

  it("rejects non-http host overrides", async () => {
    const env = await load({ NEXT_PUBLIC_URL_NEAR_DEMO: "javascript:alert(1)" });
    expect(env.HOSTS.nearDemo).toBe("https://demo.entx.space");
  });
});
