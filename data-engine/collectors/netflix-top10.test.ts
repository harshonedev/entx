// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db/client";
import { migrate } from "../db/migrate";
import type { PoliteFetch } from "../http/polite-fetch";
import { latestWeek, NETFLIX_FILES, netflixTop10 } from "./netflix-top10";
import type { CollectorContext } from "./types";

const fx = (n: string) => readFileSync(new URL(`../fixtures/netflix/${n}`, import.meta.url), "utf8");
const global = fx("global.tsv");
const countries = fx("countries.tsv");

const ctxFor = (db: Db, fetch: PoliteFetch): CollectorContext => ({
  db,
  fetch,
  now: () => new Date("2026-11-17T18:00:00Z"),
  log: () => {},
  config: { databaseUrl: "", userAgent: "entx-data-engine/0 (x)", tmdbToken: "", sacnilkEnabled: false, healthPort: 8080, viewerDbPassword: null },
});

const serve = (files: Record<string, string>): { fetch: PoliteFetch; urls: string[] } => {
  const urls: string[] = [];
  return {
    urls,
    fetch: async (url) => {
      urls.push(url);
      return { status: 200, url, contentType: "text/tab-separated-values", body: new TextEncoder().encode(files[url]), fetchedAt: new Date() };
    },
  };
};

describe("netflix top 10", () => {
  it("latestWeek finds max week by header name in both files", () => {
    expect(latestWeek(global)).toBe("2026-11-08");
    expect(latestWeek(countries)).toBe("2026-11-08"); // week is the 3rd column here
    expect(latestWeek("week\tx\n2026-01-04\ta\n2025-12-28\tb\n")).toBe("2026-01-04");
  });

  it("latestWeek returns null without a week column", () => {
    expect(latestWeek("rank\ttitle\n1\tx\n")).toBeNull();
  });

  describe("collector", () => {
    let db: Db;
    beforeEach(async () => {
      db = await createTestDb();
      await migrate(db);
    });
    afterEach(() => db.close());

    it("snapshots both files with observed week", async () => {
      const { fetch, urls } = serve({ [NETFLIX_FILES.global]: global, [NETFLIX_FILES.countries]: countries });
      const r = await netflixTop10.run(ctxFor(db, fetch));
      expect(urls).toEqual([NETFLIX_FILES.global, NETFLIX_FILES.countries]);
      expect(r).toMatchObject({ snapshots: 2, skipped: 0, degraded: false });
      const rows = await db.query<{ observed_at: Date }>("select observed_at from snapshots");
      expect(rows.every((x) => new Date(x.observed_at).toISOString().startsWith("2026-11-08"))).toBe(true);
    });

    it("unchanged file is not re-snapshotted", async () => {
      const { fetch } = serve({ [NETFLIX_FILES.global]: global, [NETFLIX_FILES.countries]: countries });
      await netflixTop10.run(ctxFor(db, fetch));
      const r = await netflixTop10.run(ctxFor(db, fetch));
      expect(r).toMatchObject({ snapshots: 0, skipped: 2, degraded: false });
    });

    it("header missing week column marks degraded", async () => {
      const { fetch } = serve({ [NETFLIX_FILES.global]: "rank\ttitle\n1\tx\n", [NETFLIX_FILES.countries]: countries });
      const r = await netflixTop10.run(ctxFor(db, fetch));
      expect(r.degraded).toBe(true);
      expect(r.detail).toMatchObject({ reason: expect.stringContaining("week") });
    });
  });
});
