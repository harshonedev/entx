// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPoliteFetch, RobotsDisallowedError } from "./polite-fetch";
import { parseRobots } from "./robots";

const UA = "entx-data-engine/0.1 (https://entx.space)";

type Reply = { status: number; body?: string; headers?: Record<string, string> };

/** Fake fetch: robots.txt from `robots`, other URLs answered from a per-URL queue (last reply repeats). */
function fakeServer(robots: string | null, replies: Record<string, Reply[]>) {
  const calls: { url: string; ua: string | null }[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const ua = new Headers(init?.headers).get("user-agent");
    calls.push({ url, ua });
    if (url.endsWith("/robots.txt"))
      return robots === null ? new Response("", { status: 404 }) : new Response(robots, { status: 200 });
    const q = replies[url] ?? [{ status: 200, body: "ok" }];
    const r = q.length > 1 ? q.shift()! : q[0];
    return new Response(r.body ?? "", { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { impl, calls };
}

function harness(robots: string | null, replies: Record<string, Reply[]> = {}, minIntervalMs = 0) {
  const server = fakeServer(robots, replies);
  const waits: number[] = [];
  let clock = 0;
  const pf = createPoliteFetch({
    userAgent: UA,
    policies: {},
    defaultPolicy: { minIntervalMs },
    fetchImpl: server.impl,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
  });
  return { pf, waits, calls: server.calls };
}

describe("politeFetch", () => {
  it("sends the configured User-Agent on every request incl robots.txt", async () => {
    const { pf, calls } = harness("User-agent: *\nAllow: /");
    await pf("https://a.test/x");
    expect(calls.map((c) => c.url)).toEqual(["https://a.test/robots.txt", "https://a.test/x"]);
    expect(calls.every((c) => c.ua === UA)).toBe(true);
  });

  it("robots disallow throws before request", async () => {
    const { pf, calls } = harness("User-agent: *\nDisallow: /api/");
    await expect(pf("https://a.test/api/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect(calls.map((c) => c.url)).toEqual(["https://a.test/robots.txt"]);
  });

  it("honours Retry-After on 429 then succeeds", async () => {
    const { pf, waits } = harness(null, {
      "https://a.test/x": [{ status: 429, headers: { "retry-after": "7" } }, { status: 200, body: "fine" }],
    });
    const res = await pf("https://a.test/x");
    expect(res.status).toBe(200);
    expect(new TextDecoder().decode(res.body)).toBe("fine");
    expect(waits).toContain(7000);
  });

  it("retries a network error then succeeds", async () => {
    const server = fakeServer(null, {});
    let failures = 1;
    const impl = (async (input: string | URL, init?: RequestInit) => {
      if (!String(input).endsWith("/robots.txt") && failures-- > 0) throw new TypeError("The socket connection was closed unexpectedly");
      return server.impl(input, init);
    }) as typeof fetch;
    const waits: number[] = [];
    const pf = createPoliteFetch({ userAgent: UA, policies: {}, defaultPolicy: { minIntervalMs: 0 }, fetchImpl: impl, sleep: async (ms) => void waits.push(ms) });
    expect((await pf("https://a.test/x")).status).toBe(200);
    expect(waits).toContain(2000);
  });

  it("aborts a hung request after timeoutMs and retries it", async () => {
    let calls = 0;
    const impl = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (++calls === 1)
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
      return new Response("late but fine", { status: 200 });
    }) as typeof fetch;
    const pf = createPoliteFetch({ userAgent: UA, policies: {}, defaultPolicy: { minIntervalMs: 0 }, fetchImpl: impl, sleep: async () => {}, timeoutMs: 20 });
    const res = await pf("https://a.test/x");
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("retries when the body stalls mid-download", async () => {
    let calls = 0;
    const impl = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (++calls === 1) {
        const stalled = new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("partial"));
            init?.signal?.addEventListener("abort", () => c.error(init.signal!.reason));
          },
        });
        return new Response(stalled, { status: 200 });
      }
      return new Response("whole", { status: 200 });
    }) as typeof fetch;
    const pf = createPoliteFetch({ userAgent: UA, policies: {}, defaultPolicy: { minIntervalMs: 0 }, fetchImpl: impl, sleep: async () => {}, timeoutMs: 20 });
    const res = await pf("https://a.test/x");
    expect(new TextDecoder().decode(res.body)).toBe("whole");
    expect(calls).toBe(2);
  });

  it("rethrows a network error after 3 retries", async () => {
    const impl = (async (input: string | URL) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      throw new TypeError("connection refused");
    }) as typeof fetch;
    const pf = createPoliteFetch({ userAgent: UA, policies: {}, defaultPolicy: { minIntervalMs: 0 }, fetchImpl: impl, sleep: async () => {} });
    await expect(pf("https://a.test/x")).rejects.toThrow("connection refused");
  });

  it("gives up after 3 retries", async () => {
    const { pf, calls } = harness(null, { "https://a.test/x": [{ status: 503 }] });
    const res = await pf("https://a.test/x");
    expect(res.status).toBe(503);
    expect(calls.filter((c) => c.url === "https://a.test/x")).toHaveLength(4);
  });

  it("spaces same-host requests by minIntervalMs", async () => {
    const { pf, waits } = harness(null, {}, 5000);
    await pf("https://a.test/1");
    await pf("https://a.test/2");
    expect(Math.max(...waits)).toBeGreaterThanOrEqual(5000);
  });

  it("documented API hosts skip robots.txt", async () => {
    const server = fakeServer("User-agent: *\nDisallow: /sparql", {});
    const pf = createPoliteFetch({
      userAgent: UA,
      policies: { "q.test": { minIntervalMs: 0, api: true } },
      defaultPolicy: { minIntervalMs: 0 },
      fetchImpl: server.impl,
      sleep: async () => {},
    });
    expect((await pf("https://q.test/sparql?query=x")).status).toBe(200);
    expect(server.calls.map((c) => c.url)).toEqual(["https://q.test/sparql?query=x"]);
    await expect(pf("https://other.test/sparql")).rejects.toBeInstanceOf(RobotsDisallowedError);
    const other = createPoliteFetch({ userAgent: UA, policies: {}, defaultPolicy: { minIntervalMs: 0 }, fetchImpl: server.impl, sleep: async () => {} });
    await expect(other("https://q.test/sparql")).rejects.toBeInstanceOf(RobotsDisallowedError);
  });

  it("robots 5xx disallows the host for the run", async () => {
    const server = fakeServer(null, {});
    const impl = (async (input: string | URL, init?: RequestInit) =>
      String(input).endsWith("/robots.txt") ? new Response("", { status: 503 }) : server.impl(input, init)) as typeof fetch;
    const pf = createPoliteFetch({ userAgent: UA, policies: {}, defaultPolicy: { minIntervalMs: 0 }, fetchImpl: impl, sleep: async () => {} });
    await expect(pf("https://a.test/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
  });
});

describe("parseRobots", () => {
  it("parseRobots longest match", () => {
    const r = parseRobots("User-agent: *\nDisallow: /movie/\nAllow: /movie/x", UA);
    expect(r.isAllowed("/movie/x")).toBe(true);
    expect(r.isAllowed("/movie/y")).toBe(false);
    expect(r.isAllowed("/news/")).toBe(true);
  });

  it("uses the group for our agent token over *", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: entx-data-engine\nAllow: /", UA);
    expect(r.isAllowed("/anything")).toBe(true);
  });

  it("supports * and $ wildcards", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*?q=\nDisallow: /*.pdf$", UA);
    expect(r.isAllowed("/search?q=x")).toBe(false);
    expect(r.isAllowed("/a.pdf")).toBe(false);
    expect(r.isAllowed("/a.pdf.html")).toBe(true);
  });
});
