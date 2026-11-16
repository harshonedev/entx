import { readFileSync } from "node:fs";
import type { Db } from "../db/client";
import type { HostPolicy, PoliteFetch } from "../http/polite-fetch";
import { itemGuard, snapshotFrom, type Collector, type CollectorContext, type JobResult } from "./types";

export const TMDB_BASE = "https://api.themoviedb.org/3";
/** Documented API (bearer token); ~4 req/s keeps well under TMDB's limits. */
export const TMDB_POLICY: Record<string, HostPolicy> = { "api.themoviedb.org": { minIntervalMs: 250, api: true } };
/** Indian original languages tracked as core markets (spec §6 title universe). */
export const INDIAN_LANGS = ["hi", "te", "ta", "ml", "kn", "bn", "mr"] as const;

const VERSION = "1";
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type Role = "market" | "watch" | "cohort";
type Kind = "movie" | "tv";
type Discovered = { id: number; original_language?: string; release_date?: string; first_air_date?: string };

const catalogAssets = (): { kind: "movie" | "show"; tmdbId: number; releaseDate?: string }[] =>
  JSON.parse(readFileSync(new URL("../../src/data/catalog.json", import.meta.url), "utf8")).assets;

async function upsertTitle(db: Db, kind: Kind, id: number, role: Role, lang: string | null, release: string | null) {
  // Never downgrade: market > watch > cohort.
  await db.query(
    `insert into tracked_titles (tmdb_kind, tmdb_id, role, origin_language, release_date)
     values ($1, $2, $3, $4, $5)
     on conflict (tmdb_kind, tmdb_id) do update set
       role = case when array_position(array['market','watch','cohort'], excluded.role)
                      < array_position(array['market','watch','cohort'], tracked_titles.role)
                   then excluded.role else tracked_titles.role end,
       origin_language = coalesce(excluded.origin_language, tracked_titles.origin_language),
       release_date = coalesce(excluded.release_date, tracked_titles.release_date)`,
    [kind, id, role, lang, release || null],
  );
}

const authed = (ctx: CollectorContext) => ({ headers: { authorization: `Bearer ${ctx.config.tmdbToken}`, accept: "application/json" } });

async function getJson(
  ctx: CollectorContext,
  c: Collector,
  fetch: PoliteFetch,
  path: string,
  params: Record<string, string | number>,
): Promise<{ status: number; json: unknown; snapshotId: bigint | null }> {
  const url = `${TMDB_BASE}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  const res = await fetch(url, authed(ctx));
  if (res.status !== 200) return { status: res.status, json: null, snapshotId: null };
  const snapshotId = await snapshotFrom(ctx, c, url, res);
  return { status: 200, json: JSON.parse(new TextDecoder().decode(res.body)), snapshotId };
}

/** Walk discover pages 1..maxPages (bounded by total_pages), upserting every result with `role`. */
async function discover(
  ctx: CollectorContext,
  c: Collector,
  kind: Kind,
  params: Record<string, string | number>,
  maxPages: number,
  role: Role,
  out: JobResult,
  guard: ReturnType<typeof itemGuard>,
) {
  for (let page = 1; page <= maxPages; page++) {
    const r = await guard(`discover/${kind} ${params.with_original_language ?? ""} p${page}`, () =>
      getJson(ctx, c, ctx.fetch, `/discover/${kind}`, { ...params, page }),
    );
    if (!r) return;
    if (r.status !== 200) {
      out.skipped++;
      out.degraded = true;
      return;
    }
    out.snapshots++;
    const body = r.json as { total_pages: number; results: Discovered[] };
    for (const d of body.results)
      await upsertTitle(ctx.db, kind, d.id, role, d.original_language ?? null, d.release_date ?? d.first_air_date ?? null);
    if (page >= body.total_pages) return;
  }
}

/** Month windows [start, end] covering the range. */
function months(from: Date, to: Date): [Date, Date][] {
  const out: [Date, Date][] = [];
  let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cur <= to) {
    const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    out.push([cur < from ? from : cur, new Date(Math.min(next.getTime() - DAY, to.getTime()))]);
    cur = next;
  }
  return out;
}

export const tmdbUniverse: Collector = {
  job: "tmdb.universe",
  provider: "tmdb",
  version: VERSION,
  async run(ctx) {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const guard = itemGuard(out);
    for (const a of catalogAssets())
      await upsertTitle(ctx.db, a.kind === "show" ? "tv" : "movie", a.tmdbId, "market", null, a.releaseDate ?? null);

    const today = ctx.now().getTime();
    for (const lang of INDIAN_LANGS) {
      await discover(
        ctx,
        this,
        "movie",
        {
          with_original_language: lang,
          "primary_release_date.gte": ymd(new Date(today - 120 * DAY)),
          "primary_release_date.lte": ymd(new Date(today + 90 * DAY)),
          sort_by: "popularity.desc",
        },
        3,
        "watch",
        out,
        guard,
      );
      await discover(
        ctx,
        this,
        "tv",
        { with_original_language: lang, "first_air_date.gte": ymd(new Date(today - 365 * DAY)), sort_by: "popularity.desc" },
        1,
        "watch",
        out,
        guard,
      );
    }

    if (ctx.range) {
      const sets: Record<string, string>[] = [
        ...INDIAN_LANGS.map((l) => ({ with_original_language: l })),
        { with_original_language: "en", region: "US" },
      ];
      for (const [start, end] of months(ctx.range.from, ctx.range.to))
        for (const s of sets)
          await discover(
            ctx,
            this,
            "movie",
            { ...s, "primary_release_date.gte": ymd(start), "primary_release_date.lte": ymd(end), sort_by: "popularity.desc" },
            5,
            "cohort",
            out,
            guard,
          );
    }
    return out;
  },
};

type Detail = {
  original_language?: string;
  release_date?: string;
  first_air_date?: string;
  external_ids?: { imdb_id?: string | null; wikidata_id?: string | null };
};

export const tmdbDetails: Collector = {
  job: "tmdb.details",
  provider: "tmdb",
  version: VERSION,
  async run(ctx) {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const roles = ctx.range ? ["market", "watch", "cohort"] : ["market", "watch"];
    const titles = await ctx.db.query<{ id: string; tmdb_kind: Kind; tmdb_id: number }>(
      "select id::text as id, tmdb_kind, tmdb_id from tracked_titles where role = any($1) order by id",
      [roles],
    );
    const missing: string[] = [];
    const guard = itemGuard(out);
    for (const t of titles) {
      const params = t.tmdb_kind === "movie" ? { append_to_response: "release_dates,external_ids" } : { append_to_response: "external_ids" };
      const r = await guard(`${t.tmdb_kind}/${t.tmdb_id}`, () => getJson(ctx, this, ctx.fetch, `/${t.tmdb_kind}/${t.tmdb_id}`, params));
      if (!r) continue;
      if (r.status !== 200) {
        out.skipped++;
        missing.push(`${t.tmdb_kind}/${t.tmdb_id}:${r.status}`);
        continue;
      }
      out.snapshots++;
      const d = r.json as Detail;
      await ctx.db.query(
        "update tracked_titles set origin_language = coalesce($2, origin_language), release_date = coalesce($3, release_date) where id = $1",
        [t.id, d.original_language ?? null, d.release_date || d.first_air_date || null],
      );
      const links: [string, string | null | undefined][] = [
        ["imdb", d.external_ids?.imdb_id],
        ["wikidata", d.external_ids?.wikidata_id],
      ];
      for (const [provider, ext] of links)
        if (ext)
          await ctx.db.query(
            `insert into title_links (tracked_title_id, provider, external_id, snapshot_id) values ($1, $2, $3, $4)
             on conflict (tracked_title_id, provider) do update set external_id = excluded.external_id, snapshot_id = excluded.snapshot_id`,
            [t.id, provider, ext, r.snapshotId!.toString()],
          );
    }
    if (missing.length) {
      out.degraded = true;
      out.detail = { ...out.detail, missing: missing.slice(0, 50), missingCount: missing.length };
    }
    return out;
  },
};
