// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db/client";
import { migrate } from "../db/migrate";
import { recordSnapshot } from "../evidence/snapshots";
import type { PoliteFetch } from "../http/polite-fetch";
import type { CollectorContext } from "./types";
import { articleUrl, pageviewsUrl, wikiArticles, wikiPageviews } from "./wikipedia";

const NOW = new Date("2026-11-16T06:00:00Z");
const DAY = 86_400_000;

const ctxFor = (db: Db, fetch: PoliteFetch, range?: CollectorContext["range"]): CollectorContext => ({
  db,
  fetch,
  now: () => NOW,
  log: () => {},
  range,
  config: { databaseUrl: "", userAgent: "entx-data-engine/0 (x)", tmdbToken: "", sacnilkEnabled: false, healthPort: 8080, viewerDbPassword: null },
});

function fake(status = 200) {
  const urls: string[] = [];
  const fetch: PoliteFetch = async (url) => {
    urls.push(url);
    return { status, url, contentType: "application/json", body: new TextEncoder().encode('{"items":[]}'), fetchedAt: NOW };
  };
  return { fetch, urls };
}

describe("wikipedia urls", () => {
  it("encodes Devanagari and slash titles", () => {
    const from = new Date("2026-11-01T00:00:00Z");
    const to = new Date("2026-11-03T00:00:00Z");
    const hi = pageviewsUrl("hiwiki", "जवान (फ़िल्म)", from, to);
    expect(hi).toContain("/per-article/hi.wikipedia.org/all-access/user/");
    expect(hi).toContain("%E0%A4%9C");
    expect(hi).toMatch(/\/daily\/20261101\/20261103$/);
    expect(pageviewsUrl("enwiki", "AC/DC", from, to)).toContain("/AC%2FDC/");
    expect(pageviewsUrl("enwiki", "Jailer 2", from, to)).toContain("/Jailer_2/");
    expect(articleUrl("tewiki", "AC/DC")).toBe("https://te.wikipedia.org/api/rest_v1/page/html/AC%2FDC");
  });
});

describe("wikipedia collectors", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await migrate(db);
    const [{ id: snap }] = await db.query<{ id: string }>(
      `insert into snapshots (provider, job, requested_url, source_url, fetched_at, http_status, payload_hash, payload_bytes, collector_version)
       values ('wikidata','x','u','u',now(),200,'h',0,'1') returning id::text as id`,
    );
    await db.query(
      `insert into tracked_titles (id, tmdb_kind, tmdb_id, role, release_date) values
        (1, 'movie', 1, 'watch', '2026-11-01'), (2, 'movie', 2, 'market', '2025-01-01')`,
    );
    await db.query(
      `insert into title_links (tracked_title_id, provider, external_id, snapshot_id) values
        (1, 'wiki:enwiki', 'New Film', $1), (1, 'wiki:hiwiki', 'नई फ़िल्म', $1), (2, 'wiki:enwiki', 'Old Film', $1), (2, 'wikidata', 'Q1', $1)`,
      [snap],
    );
  });
  afterEach(() => db.close());

  it("pageviews: new articles get 60 days, known ones resume after their last snapshot (≥ 3-day overlap)", async () => {
    // New Film (enwiki) was last collected through 2026-11-05; the other two links have never been collected.
    await recordSnapshot(db, {
      provider: "wikimedia_pageviews",
      job: "wiki.pageviews",
      requestedUrl: pageviewsUrl("enwiki", "New Film", new Date("2026-10-20"), new Date("2026-11-05")),
      sourceUrl: "x",
      fetchedAt: new Date("2026-11-06T04:00:00Z"),
      observedAt: new Date("2026-11-05T00:00:00Z"),
      httpStatus: 200,
      contentType: "application/json",
      body: new Uint8Array([1]),
      collectorVersion: "1",
    });
    const a = fake();
    const r = await wikiPageviews.run(ctxFor(db, a.fetch));
    expect(a.urls).toHaveLength(3); // one per wiki:* link; wikidata link ignored
    expect(a.urls.find((u) => u.includes("/en.wikipedia.org/all-access/user/New_Film/"))).toMatch(/\/daily\/20261106\/20261115$/);
    expect(a.urls.find((u) => u.includes("Old_Film"))).toMatch(/\/daily\/20260917\/20261115$/);
    expect(r.snapshots).toBe(3);

    // Collected yesterday: still re-fetch the last 3 days for late-arriving data.
    const y = fake();
    await recordSnapshot(db, {
      provider: "wikimedia_pageviews",
      job: "wiki.pageviews",
      requestedUrl: pageviewsUrl("enwiki", "Old Film", new Date("2026-09-17"), new Date("2026-11-15")),
      sourceUrl: "x",
      fetchedAt: new Date("2026-11-16T04:00:00Z"),
      observedAt: new Date("2026-11-15T00:00:00Z"),
      httpStatus: 200,
      contentType: "application/json",
      body: new Uint8Array([1]),
      collectorVersion: "1",
    });
    await wikiPageviews.run(ctxFor(db, y.fetch));
    expect(y.urls.find((u) => u.includes("Old_Film"))).toMatch(/\/daily\/20261113\/20261115$/);

    const b = fake();
    await wikiPageviews.run(ctxFor(db, b.fetch, { from: new Date("2015-01-01"), to: new Date("2016-12-31") }));
    expect(b.urls.every((u) => u.endsWith("/daily/20150701/20161231"))).toBe(true);
  });

  it("a pageviews request that throws is skipped and the others still run", async () => {
    const urls: string[] = [];
    const fetch: PoliteFetch = async (url) => {
      urls.push(url);
      if (url.includes("New_Film")) throw new Error("timeout");
      return { status: 200, url, contentType: "application/json", body: new TextEncoder().encode("{}"), fetchedAt: NOW };
    };
    const r = await wikiPageviews.run(ctxFor(db, fetch));
    expect(r).toMatchObject({ snapshots: 2, skipped: 1, degraded: true });
  });

  it("pageviews 404 (no data yet) is skipped, not degraded", async () => {
    const r = await wikiPageviews.run(ctxFor(db, fake(404).fetch));
    expect(r).toMatchObject({ snapshots: 0, skipped: 3, degraded: false });
  });

  it("article job skips titles snapshotted < 7 days ago unless released within 60 days", async () => {
    for (const [title, site] of [
      ["New Film", "en"],
      ["Old Film", "en"],
    ])
      await recordSnapshot(db, {
        provider: "wikipedia",
        job: "wiki.articles",
        requestedUrl: articleUrl(`${site}wiki`, title),
        sourceUrl: "x",
        fetchedAt: new Date(NOW.getTime() - 2 * DAY),
        httpStatus: 200,
        contentType: "text/html",
        body: new Uint8Array([1]),
        collectorVersion: "1",
      });
    const a = fake();
    await wikiArticles.run(ctxFor(db, a.fetch));
    // New Film (released 15 days ago) refetches both wikis daily; Old Film was fetched 2 days ago, so it waits.
    expect(a.urls.sort()).toEqual([articleUrl("enwiki", "New Film"), articleUrl("hiwiki", "नई फ़िल्म")].sort());
  });
});
