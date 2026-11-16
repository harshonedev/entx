// @vitest-environment node
import { Cron } from "croner";
import { describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { healthHandler } from "../health";
import { HOST_POLICIES, SCHEDULE, trackInFlight } from "./schedule";

describe("schedule", () => {
  it("every collector appears in SCHEDULE exactly once", () => {
    const jobs = SCHEDULE.map((s) => (s.collector === "retention" ? "retention" : s.collector.job));
    expect(jobs.sort()).toEqual(
      ["netflix.top10", "retention", "sacnilk.daily", "tmdb.details", "tmdb.universe", "wiki.articles", "wiki.pageviews", "wikidata.items"].sort(),
    );
  });

  it("every cron expression parses", () => {
    for (const s of SCHEDULE) expect(() => new Cron(s.cron, { paused: true, timezone: "UTC" }).stop()).not.toThrow();
  });

  it("host policies cover every collector host, APIs and published datasets flagged, scraped sites not", () => {
    expect(HOST_POLICIES["api.themoviedb.org"].api).toBe(true);
    expect(HOST_POLICIES["query.wikidata.org"].api).toBe(true);
    expect(HOST_POLICIES["wikimedia.org"].api).toBe(true);
    expect(HOST_POLICIES["*.wikipedia.org"].api).toBe(true);
    expect(HOST_POLICIES["www.sacnilk.com"]).toEqual({ minIntervalMs: 5000 });
    expect(HOST_POLICIES["www.netflix.com"]).toEqual({ minIntervalMs: 2000, api: true, timeoutMs: 300_000 }); // published dataset (user decision 2026-11-16)
  });
});

describe("health", () => {
  const dbWith = (query: Db["query"]): Db => ({ query } as Db);

  it("health returns 503 when db query throws", async () => {
    const res = await healthHandler(dbWith(async () => { throw new Error("down"); }));
    expect(res.status).toBe(503);
  });

  it("health returns last run per job", async () => {
    const res = await healthHandler(
      dbWith((async () => [{ job: "tmdb.details", status: "ok", finished_at: new Date("2026-11-16T02:31:00Z") }]) as Db["query"]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, jobs: { "tmdb.details": { status: "ok", finishedAt: "2026-11-16T02:31:00.000Z" } } });
  });
});

describe("trackInFlight", () => {
  it("a rejecting job leaves no unhandled rejection and is removed from the set", async () => {
    const set = new Set<Promise<unknown>>();
    const p = trackInFlight(set, Promise.reject(new Error("db blip")));
    await expect(p).rejects.toThrow("db blip");
    await new Promise((r) => setTimeout(r, 10));
    expect(set.size).toBe(0);
  });
});
