// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db/client";
import { migrate } from "../db/migrate";
import type { PoliteFetch } from "../http/polite-fetch";
import { extractMovieKeys, SACNILK_BASE, SACNILK_POLICY, sacnilk } from "./sacnilk";
import type { CollectorContext } from "./types";

const fx = (n: string) => readFileSync(new URL(`../fixtures/sacnilk/${n}`, import.meta.url), "utf8");
const home = fx("home.html");
const latest = fx("latest.html");
const NOW = new Date("2026-11-16T06:00:00Z");

const ctxFor = (db: Db, fetch: PoliteFetch, enabled = true, range?: CollectorContext["range"]): CollectorContext => ({
  db,
  fetch,
  now: () => NOW,
  log: () => {},
  range,
  config: { databaseUrl: "", userAgent: "entx-engine/0 (x)", tmdbToken: "", sacnilkEnabled: enabled, healthPort: 8080 },
});

function site(pages: Record<string, string>) {
  const urls: string[] = [];
  const fetch: PoliteFetch = async (url) => {
    urls.push(url);
    const path = new URL(url).pathname;
    const body = pages[path] ?? "<html>movie page</html>";
    return { status: 200, url, contentType: "text/html", body: new TextEncoder().encode(body), fetchedAt: NOW };
  };
  return { fetch, urls };
}

describe("sacnilk", () => {
  it("extractMovieKeys finds /movie/ links and ignores records pages", () => {
    const keys = [...extractMovieKeys(home), ...extractMovieKeys(latest)];
    expect(keys).toContain("/movie/Jailer_2_2026");
    expect(extractMovieKeys(home)).toContain("/movie/GOAT_Telugu_2026");
    expect(keys.every((k) => /^\/movie\/[A-Za-z0-9_]+_\d{4}$/.test(k))).toBe(true);
    expect(keys.some((k) => k.includes("box-office-records"))).toBe(false);
    expect(new Set(extractMovieKeys(home)).size).toBe(extractMovieKeys(home).length);
    expect(extractMovieKeys('<a href="/box-office-records/top">x</a><a href="https://www.sacnilk.com/movie/Coolie_2025">y</a>')).toEqual([
      "/movie/Coolie_2025",
    ]);
  });

  it("host policy for sacnilk is 5000 ms and not an API", () => {
    expect(SACNILK_POLICY["www.sacnilk.com"]).toEqual({ minIntervalMs: 5000 });
  });

  describe("collector", () => {
    let db: Db;
    beforeEach(async () => {
      db = await createTestDb();
      await migrate(db);
    });
    afterEach(() => db.close());

    it("disabled flag makes no requests", async () => {
      const { fetch, urls } = site({});
      const r = await sacnilk.run(ctxFor(db, fetch, false));
      expect(urls).toEqual([]);
      expect(r).toEqual({ snapshots: 0, skipped: 0, degraded: false, detail: { disabled: true } });
    });

    it("listing with no movie links marks run degraded", async () => {
      const { fetch, urls } = site({ "/": "<html>Just a moment...</html>", "/latest-boxoffice-collection": "<html></html>" });
      const r = await sacnilk.run(ctxFor(db, fetch));
      expect(r.degraded).toBe(true);
      expect(r.detail).toMatchObject({ reason: "no movie links" });
      expect(r.snapshots).toBe(2); // both listing pages kept as evidence
      expect(urls).toHaveLength(2);
    });

    it("only items seen in last 21 days are fetched", async () => {
      await db.query(
        `insert into discovered_items (provider, item_key, first_seen_at, last_seen_at) values
          ('sacnilk', '/movie/Old_Run_2026', now() - interval '60 days', $1::timestamptz - interval '30 days'),
          ('sacnilk', '/movie/Still_Running_2026', now() - interval '20 days', $1::timestamptz - interval '3 days')`,
        [NOW],
      );
      const { fetch, urls } = site({ "/": home, "/latest-boxoffice-collection": latest });
      const r = await sacnilk.run(ctxFor(db, fetch));
      const moviePaths = urls.slice(2).map((u) => new URL(u).pathname);
      expect(moviePaths).toContain("/movie/Still_Running_2026");
      expect(moviePaths).toContain("/movie/Jailer_2_2026");
      expect(moviePaths).not.toContain("/movie/Old_Run_2026");
      expect(urls.slice(0, 2)).toEqual([`${SACNILK_BASE}/`, `${SACNILK_BASE}/latest-boxoffice-collection`]);
      expect(r.degraded).toBe(false);
      expect(r.snapshots).toBe(urls.length);
    });

    it("backfill also fetches items first seen inside the range", async () => {
      await db.query(
        `insert into discovered_items (provider, item_key, first_seen_at, last_seen_at) values
          ('sacnilk', '/movie/Old_Run_2026', '2026-03-01', '2026-04-01')`,
      );
      const { fetch, urls } = site({ "/": "<html></html>", "/latest-boxoffice-collection": '<a href="/movie/X_2026">x</a>' });
      await sacnilk.run(ctxFor(db, fetch, true, { from: new Date("2026-01-01"), to: new Date("2026-06-30") }));
      expect(urls.map((u) => new URL(u).pathname)).toContain("/movie/Old_Run_2026");
    });
  });
});
