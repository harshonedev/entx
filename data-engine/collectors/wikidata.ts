import type { HostPolicy } from "../http/polite-fetch";
import { itemGuard, snapshotFrom, type Collector, type JobResult } from "./types";

export const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
/** Documented query API: one query at a time, ≥1 s apart, back off on 429 (60 s processing per 60 s per client). */
export const WIKIDATA_POLICY: Record<string, HostPolicy> = { "query.wikidata.org": { minIntervalMs: 1000, maxRetries: 3, api: true } };
/** Wikipedias whose article titles we record (English + Indian languages). */
export const WIKI_SITES = ["enwiki", "hiwiki", "tawiki", "tewiki", "mlwiki", "knwiki", "bnwiki", "mrwiki"] as const;

const VERSION = "1";
const BATCH = 50;

const values = (ids: number[]) => ids.map((i) => `"${Math.trunc(i)}"`).join(" ");

/** One query for a batch of TMDB ids: item, IMDb id, box office (P2142 with time + reference) and sitelinks. */
export function buildSparql(movieIds: number[], tvIds: number[]): string {
  const branches = [
    movieIds.length ? `{ VALUES ?tmdbMovie { ${values(movieIds)} } ?item wdt:P4947 ?tmdbMovie . }` : null,
    tvIds.length ? `{ VALUES ?tmdbTv { ${values(tvIds)} } ?item wdt:P4983 ?tmdbTv . }` : null,
  ].filter(Boolean);
  return `SELECT ?item ?tmdbMovie ?tmdbTv ?imdb ?boxOffice ?boxOfficeUnit ?boxOfficeTime ?boxOfficeRef ?site ?title WHERE {
  ${branches.join("\n  UNION\n  ")}
  OPTIONAL { ?item wdt:P345 ?imdb . }
  OPTIONAL {
    ?item p:P2142 ?bo . ?bo psv:P2142 [ wikibase:quantityAmount ?boxOffice ; wikibase:quantityUnit ?boxOfficeUnit ] .
    OPTIONAL { ?bo pq:P585 ?boxOfficeTime . }
    OPTIONAL { ?bo prov:wasDerivedFrom/pr:P854 ?boxOfficeRef . }
  }
  OPTIONAL {
    ?article schema:about ?item ; schema:isPartOf ?wiki ; schema:name ?title .
    ?wiki wikibase:wikiGroup "wikipedia" .
    BIND(REPLACE(STR(?wiki), "^https://([a-z]+)\\\\.wikipedia\\\\.org/$", "$1wiki") AS ?site)
    FILTER(?site IN (${WIKI_SITES.map((s) => `"${s}"`).join(",")}))
  }
}`;
}

type Binding = Record<string, { value: string } | undefined>;
export type WikidataItem = { tmdbKind: "movie" | "tv"; tmdbId: number; qid: string; imdb?: string; sitelinks: Record<string, string> };

/** Collapse SPARQL rows (one per sitelink × box-office statement) into one entry per item. Box office is parsed in phase 2. */
export function parseBindings(json: { results: { bindings: Binding[] } }): WikidataItem[] {
  const byKey = new Map<string, WikidataItem>();
  for (const b of json.results.bindings) {
    const kind = b.tmdbMovie ? "movie" : b.tmdbTv ? "tv" : null;
    const item = b.item?.value;
    if (!kind || !item) continue;
    const tmdbId = Number((b.tmdbMovie ?? b.tmdbTv)!.value);
    const key = `${kind}:${tmdbId}`;
    const entry = byKey.get(key) ?? { tmdbKind: kind, tmdbId, qid: item.replace(/^.*\//, ""), sitelinks: {} };
    if (b.imdb) entry.imdb = b.imdb.value;
    if (b.site && b.title) entry.sitelinks[b.site.value] = b.title.value;
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

export const wikidata: Collector = {
  job: "wikidata.items",
  provider: "wikidata",
  version: VERSION,
  async run(ctx) {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const roles = ctx.range ? ["market", "watch", "cohort"] : ["market", "watch"];
    const titles = await ctx.db.query<{ id: string; tmdb_kind: "movie" | "tv"; tmdb_id: number }>(
      "select id::text as id, tmdb_kind, tmdb_id from tracked_titles where role = any($1) order by id",
      [roles],
    );
    const guard = itemGuard(out);
    for (let i = 0; i < titles.length; i += BATCH) {
      const batch = titles.slice(i, i + BATCH);
      const url = `${WIKIDATA_SPARQL}?${new URLSearchParams({
        query: buildSparql(
          batch.filter((t) => t.tmdb_kind === "movie").map((t) => t.tmdb_id),
          batch.filter((t) => t.tmdb_kind === "tv").map((t) => t.tmdb_id),
        ),
      })}`;
      const got = await guard(`batch ${i / BATCH + 1}`, async () => {
        const res = await ctx.fetch(url, { headers: { accept: "application/sparql-results+json" } });
        if (res.status !== 200) return null;
        const items = parseBindings(JSON.parse(new TextDecoder().decode(res.body)));
        return { items, snapshotId: (await snapshotFrom(ctx, this, url, res)).toString() };
      });
      if (!got) {
        out.skipped += batch.length - (got === undefined ? 1 : 0); // a throw already counted one
        out.degraded = true;
        continue;
      }
      const { snapshotId } = got;
      out.snapshots++;
      const found = new Map(got.items.map((it) => [`${it.tmdbKind}:${it.tmdbId}`, it]));
      for (const t of batch) {
        const it = found.get(`${t.tmdb_kind}:${t.tmdb_id}`);
        if (!it) {
          out.skipped++;
          continue;
        }
        const links: [string, string][] = [["wikidata", it.qid], ...Object.entries(it.sitelinks).map(([s, title]) => [`wiki:${s}`, title] as [string, string])];
        if (it.imdb) links.push(["imdb", it.imdb]);
        for (const [provider, ext] of links)
          await ctx.db.query(
            `insert into title_links (tracked_title_id, provider, external_id, snapshot_id) values ($1, $2, $3, $4)
             on conflict (tracked_title_id, provider) do update set external_id = excluded.external_id, snapshot_id = excluded.snapshot_id`,
            [t.id, provider, ext, snapshotId],
          );
      }
    }
    return out;
  },
};
