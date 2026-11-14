// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, own, readJson } from "./http";

const r = (headers: Record<string, string>, body?: string) =>
  new Request("http://x/", { method: "POST", headers, body });

afterEach(() => vi.unstubAllEnvs());

describe("clientIp", () => {
  it("is shared without a trusted proxy", () => {
    vi.stubEnv("TRUST_PROXY", "");
    vi.stubEnv("VERCEL", "");
    expect(clientIp(r({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }))).toBe("shared");
  });
  it("behind Traefik uses the last forwarded hop", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY", "true");
    expect(clientIp(r({ "x-forwarded-for": "6.6.6.6, 1.1.1.1", "x-real-ip": "6.6.6.6" }))).toBe("1.1.1.1");
  });
  it("behind Cloudflare uses cf-connecting-ip", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY", "cloudflare");
    expect(clientIp(r({ "cf-connecting-ip": "3.3.3.3", "x-forwarded-for": "3.3.3.3, 172.67.0.1" }))).toBe("3.3.3.3");
    expect(clientIp(r({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(r({ "cf-connecting-ip": "not-an-ip-" + "x".repeat(50) }))).toBe("shared");
  });
});

describe("readJson", () => {
  it("parses small bodies and rejects large or invalid ones", async () => {
    expect(await readJson(r({}, '{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(r({}, "{"))).toBeNull();
    expect(await readJson(r({}, JSON.stringify({ a: "x".repeat(3000) })))).toBeNull();
  });
});

describe("own", () => {
  it("ignores inherited keys", () => {
    const t = { a: 1 };
    expect(own(t, "a")).toBe(1);
    expect(own(t, "__proto__")).toBeUndefined();
    expect(own(t, "constructor")).toBeUndefined();
    expect(own(t, 5)).toBeUndefined();
  });
});
