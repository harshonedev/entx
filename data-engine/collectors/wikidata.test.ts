// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db/client";
import { migrate } from "../db/migrate";
import type { PoliteFetch } from "../http/polite-fetch";
import type { CollectorContext } from "./types";
import { buildSparql, parseBindings, wikidata } from "./wikidata";

const raw = readFileSync(new URL("../fixtures/wikidata/items.json", import.meta.url), "utf8");

const ctxFor = (db: Db, fetch: PoliteFetch): CollectorContext => ({
  db,
  fetch,
  now: () => new Date("2026-11-16T00:00:00Z"),
  log: () => {},
  config: { databaseUrl: "", userAgent: "entx-data-engine/0 (x)", tmdbToken: "", sacnilkEnabled: false, healthPort: 8080, viewerDbPassword: null },
});

describe("wikidata", () => {
  it("buildSparql includes both id sets", () => {
    const q = buildSparql([1389379, 579974], [213375]);
    expect(q).toContain('VALUES ?tmdbMovie { "1389379" "579974" }');
    expect(q).toContain('VALUES ?tmdbTv { "213375" }');
    expect(q).toContain("wdt:P4947");
    expect(q).toContain("wdt:P4983");
    expect(q).toContain("P2142");
  });

  it("buildSparql with no tv ids omits the tv branch", () => {
    expect(buildSparql([1], [])).not.toContain("P4983");
  });

  it("parseBindings maps sitelinks per wiki", () => {
    const items = parseBindings(JSON.parse(raw));
    const rrr = items.find((i) => i.tmdbId === 579974)!;
    expect(rrr).toMatchObject({ tmdbKind: "movie", qid: "Q60424165", imdb: "tt8178634" });
    expect(rrr.sitelinks.enwiki).toBe("RRR");
    expect(rrr.sitelinks.hiwiki).toBe("रौद्रम् रणम् रुधिरम्");
    expect(items.find((i) => i.tmdbId === 213375)).toMatchObject({ tmdbKind: "tv", qid: "Q126092795" });
  });

  describe("collector", () => {
    let db: Db;
    beforeEach(async () => {
      db = await createTestDb();
      await migrate(db);
      await db.query(
        `insert into tracked_titles (tmdb_kind, tmdb_id, role) values
         ('movie', 579974, 'watch'), ('movie', 1389379, 'watch'), ('tv', 213375, 'market'), ('movie', 42, 'watch')`,
      );
    });
    afterEach(() => db.close());

    const fake = (): { fetch: PoliteFetch; urls: string[] } => {
      const urls: string[] = [];
      return {
        urls,
        fetch: async (url) => {
          urls.push(url);
          return { status: 200, url, contentType: "application/sparql-results+json", body: new TextEncoder().encode(raw), fetchedAt: new Date() };
        },
      };
    };

    it("collector writes wiki:hiwiki link for a Hindi film", async () => {
      const { fetch, urls } = fake();
      const r = await wikidata.run(ctxFor(db, fetch));
      expect(urls).toHaveLength(1);
      expect(urls[0]).toMatch(/^https:\/\/query\.wikidata\.org\/sparql\?/);
      expect(r.snapshots).toBe(1);
      const links = await db.query<{ provider: string; external_id: string }>(
        `select provider, external_id from title_links l join tracked_titles t on t.id = l.tracked_title_id
         where t.tmdb_id = 579974 order by provider`,
      );
      expect(links).toContainEqual({ provider: "wiki:hiwiki", external_id: "रौद्रम् रणम् रुधिरम्" });
      expect(links).toContainEqual({ provider: "wikidata", external_id: "Q60424165" });
    });

    it("a batch whose query throws is skipped, not failed", async () => {
      const fetch: PoliteFetch = async () => {
        throw new Error("timeout");
      };
      const r = await wikidata.run(ctxFor(db, fetch));
      expect(r).toMatchObject({ snapshots: 0, degraded: true });
      expect(r.skipped).toBeGreaterThan(0);
    });

    it("title with no item is counted skipped, not failed", async () => {
      const { fetch } = fake();
      const r = await wikidata.run(ctxFor(db, fetch));
      expect(r.skipped).toBe(1); // tmdb 42 has no Wikidata item
      expect(r.degraded).toBe(false);
    });
  });
});
