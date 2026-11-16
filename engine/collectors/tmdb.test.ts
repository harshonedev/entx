// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db/client";
import { migrate } from "../db/migrate";
import type { FetchedResponse, PoliteFetch } from "../http/polite-fetch";
import { tmdbDetails, tmdbUniverse } from "./tmdb";
import type { CollectorContext } from "./types";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/tmdb/${name}`, import.meta.url), "utf8");
const discoverTe = JSON.parse(fixture("discover-movie-te.json"));
const CATALOG_MOVIE = 1368337; // The Odyssey, a market title in src/data/catalog.json

const reply = (url: string, status: number, body: unknown): FetchedResponse => ({
  status,
  url,
  contentType: "application/json",
  body: new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body)),
  fetchedAt: new Date("2026-11-16T00:00:00Z"),
});

/** Fake TMDB: discover/movie returns the Telugu fixture plus one catalogue movie; discover/tv is empty. */
function fakeTmdb(details: Record<string, { status: number; body: unknown }> = {}) {
  const urls: string[] = [];
  const fetch: PoliteFetch = async (url) => {
    urls.push(url);
    const u = new URL(url);
    if (u.pathname === "/3/discover/movie")
      return reply(url, 200, {
        ...discoverTe,
        total_pages: 2,
        results: [...discoverTe.results, { id: CATALOG_MOVIE, title: "The Odyssey", original_language: "en", release_date: "2026-07-17" }],
      });
    if (u.pathname === "/3/discover/tv") return reply(url, 200, { page: 1, total_pages: 1, results: [] });
    const d = details[u.pathname];
    return d ? reply(url, d.status, d.body) : reply(url, 404, { status_code: 34 });
  };
  return { fetch, urls };
}

const ctxFor = (db: Db, fetch: PoliteFetch, range?: CollectorContext["range"]): CollectorContext => ({
  db,
  fetch,
  now: () => new Date("2026-11-16T00:00:00Z"),
  log: () => {},
  range,
  config: { databaseUrl: "", userAgent: "entx-engine/0 (x)", tmdbToken: "tok", sacnilkEnabled: false, healthPort: 8080 },
});

describe("tmdb collectors", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  const roles = async () =>
    db.query<{ tmdb_kind: string; tmdb_id: number; role: string }>("select tmdb_kind, tmdb_id, role from tracked_titles");

  it("universe seeds 17 market titles from catalog.json", async () => {
    const { fetch } = fakeTmdb();
    await tmdbUniverse.run(ctxFor(db, fetch));
    expect((await roles()).filter((r) => r.role === "market")).toHaveLength(17);
  });

  it("universe adds Indian discover results as watch, keeps market role on overlap", async () => {
    const { fetch, urls } = fakeTmdb();
    const result = await tmdbUniverse.run(ctxFor(db, fetch));
    const all = await roles();
    expect(all.find((r) => r.tmdb_id === 1389379)).toMatchObject({ tmdb_kind: "movie", role: "watch" });
    expect(all.find((r) => r.tmdb_id === CATALOG_MOVIE)?.role).toBe("market");
    // 7 languages x 2 movie pages (total_pages 2) + 7 tv pages, each snapshotted
    expect(urls.filter((u) => u.includes("/discover/movie"))).toHaveLength(14);
    expect(urls.filter((u) => u.includes("/discover/tv"))).toHaveLength(7);
    expect(result.snapshots).toBe(21);
    expect(urls.every((u) => !u.includes("api_key"))).toBe(true);
  });

  it("cohort titles are added only in backfill and never downgrade a role", async () => {
    const { fetch } = fakeTmdb();
    await tmdbUniverse.run(ctxFor(db, fetch));
    await tmdbUniverse.run(ctxFor(db, fetch, { from: new Date("2026-09-01"), to: new Date("2026-10-31") }));
    const all = await roles();
    expect(all.find((r) => r.tmdb_id === CATALOG_MOVIE)?.role).toBe("market");
    expect(all.find((r) => r.tmdb_id === 1389379)?.role).toBe("watch");
  });

  it("details writes imdb and wikidata links with snapshot id", async () => {
    await db.query("insert into tracked_titles (tmdb_kind, tmdb_id, role) values ('movie', 1389379, 'watch'), ('tv', 213375, 'market')");
    const { fetch } = fakeTmdb({
      "/3/movie/1389379": { status: 200, body: fixture("movie-1389379.json") },
      "/3/tv/213375": { status: 200, body: fixture("tv-213375.json") },
    });
    const r = await tmdbDetails.run(ctxFor(db, fetch));
    expect(r).toMatchObject({ snapshots: 2, skipped: 0, degraded: false });
    const links = await db.query<{ provider: string; external_id: string; snapshot_id: string }>(
      `select l.provider, l.external_id, l.snapshot_id::text from title_links l join tracked_titles t on t.id = l.tracked_title_id
       where t.tmdb_id = 1389379 order by provider`,
    );
    expect(links.map((l) => [l.provider, l.external_id])).toEqual([
      ["imdb", "tt32324552"],
      ["wikidata", "Q140419781"],
    ]);
    expect(links[0].snapshot_id).toBeTruthy();
    const [t] = await db.query<{ origin_language: string; release_date: string }>(
      "select origin_language, release_date::text from tracked_titles where tmdb_id = 1389379",
    );
    expect(t).toEqual({ origin_language: "te", release_date: "2026-10-15" });
  });

  it("404 title is skipped and job continues", async () => {
    await db.query(
      "insert into tracked_titles (tmdb_kind, tmdb_id, role) values ('movie', 1389379, 'watch'), ('movie', 999999999, 'watch'), ('tv', 213375, 'market')",
    );
    const { fetch } = fakeTmdb({
      "/3/movie/1389379": { status: 200, body: fixture("movie-1389379.json") },
      "/3/tv/213375": { status: 200, body: fixture("tv-213375.json") },
    });
    const r = await tmdbDetails.run(ctxFor(db, fetch));
    expect(r).toMatchObject({ snapshots: 2, skipped: 1, degraded: true });
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from title_links");
    expect(n).toBe(4);
  });
});
