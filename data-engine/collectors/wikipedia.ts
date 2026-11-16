import type { Db } from "../db/client";
import type { HostPolicy } from "../http/polite-fetch";
import { itemGuard, snapshotFrom, type Collector, type JobResult } from "./types";

/** Both are documented Wikimedia APIs (UA with contact required). */
export const WIKIPEDIA_POLICY: Record<string, HostPolicy> = {
  "wikimedia.org": { minIntervalMs: 200, api: true },
  "*.wikipedia.org": { minIntervalMs: 500, api: true },
};

const VERSION = "1";
const DAY = 86_400_000;
/** The Pageviews API has no data before this date. */
const PAGEVIEWS_START = new Date("2015-07-01T00:00:00Z");

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
const lang = (site: string) => site.replace(/wiki$/, "");
const encodeTitle = (article: string) => encodeURIComponent(article.replaceAll(" ", "_"));
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const pageviewsUrl = (site: string, article: string, from: Date, to: Date) =>
  `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang(site)}.wikipedia.org/all-access/user/${encodeTitle(article)}/daily/${yyyymmdd(from)}/${yyyymmdd(to)}`;

export const articleUrl = (site: string, article: string) =>
  `https://${lang(site)}.wikipedia.org/api/rest_v1/page/html/${encodeTitle(article)}`;

type Link = { site: string; article: string; release_date: string | null };

async function wikiLinks(ctx: Parameters<Collector["run"]>[0]): Promise<Link[]> {
  const roles = ctx.range ? ["market", "watch", "cohort"] : ["market", "watch"];
  return ctx.db.query<Link>(
    `select substr(l.provider, 6) as site, l.external_id as article, t.release_date::text as release_date
     from title_links l join tracked_titles t on t.id = l.tracked_title_id
     where l.provider like 'wiki:%' and t.role = any($1) order by t.id, l.provider`,
    [roles],
  );
}

/**
 * Scheduled window start for one article: the day after its last collected day, so gaps (new titles linked days
 * later, worker outages) are filled; at least the last 3 days for late-arriving data; at most 60 days back.
 */
async function resumeFrom(db: Db, site: string, article: string, today: Date): Promise<Date> {
  const prefix = pageviewsUrl(site, article, today, today).replace(/\/daily\/.*$/, "/daily/");
  const [last] = await db.query<{ observed_at: Date | null }>(
    `select max(observed_at) as observed_at from snapshots
     where provider = 'wikimedia_pageviews' and http_status = 200 and left(requested_url, length($1)) = $1`,
    [prefix],
  );
  const floor = today.getTime() - 60 * DAY;
  const lateData = today.getTime() - 3 * DAY;
  const next = last?.observed_at ? new Date(last.observed_at).getTime() + DAY : floor;
  return new Date(Math.max(floor, Math.min(next, lateData)));
}

export const wikiPageviews: Collector = {
  job: "wiki.pageviews",
  provider: "wikimedia_pageviews",
  version: VERSION,
  async run(ctx) {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const today = startOfDay(ctx.now());
    const yesterday = new Date(today.getTime() - DAY);
    const guard = itemGuard(out);
    for (const l of await wikiLinks(ctx)) {
      const { from, to } = ctx.range
        ? { from: new Date(Math.max(ctx.range.from.getTime(), PAGEVIEWS_START.getTime())), to: ctx.range.to }
        : { from: await resumeFrom(ctx.db, l.site, l.article, today), to: yesterday };
      const url = pageviewsUrl(l.site, l.article, from, to);
      const res = await guard(`${l.site}:${l.article}`, () => ctx.fetch(url, { headers: { accept: "application/json" } }));
      if (!res) continue;
      if (res.status === 404) {
        out.skipped++; // article has no views in range yet
        continue;
      }
      if (res.status !== 200) {
        out.skipped++;
        out.degraded = true;
        continue;
      }
      await snapshotFrom(ctx, this, url, res, to);
      out.snapshots++;
    }
    return out;
  },
};

export const wikiArticles: Collector = {
  job: "wiki.articles",
  provider: "wikipedia",
  version: VERSION,
  async run(ctx) {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const now = ctx.now().getTime();
    const guard = itemGuard(out);
    for (const l of await wikiLinks(ctx)) {
      const url = articleUrl(l.site, l.article);
      const recent = l.release_date !== null && Math.abs(now - Date.parse(l.release_date)) <= 60 * DAY;
      const maxAge = recent ? 20 * 3_600_000 : 7 * DAY; // daily around release, weekly otherwise
      const [last] = await ctx.db.query<{ fetched_at: Date }>(
        "select fetched_at from snapshots where requested_url = $1 order by fetched_at desc limit 1",
        [url],
      );
      if (last && now - new Date(last.fetched_at).getTime() < maxAge) continue;
      const res = await guard(`${l.site}:${l.article}`, () => ctx.fetch(url, { headers: { accept: "text/html" } }));
      if (!res) continue;
      if (res.status !== 200) {
        out.skipped++;
        if (res.status !== 404) out.degraded = true;
        continue;
      }
      await snapshotFrom(ctx, this, url, res);
      out.snapshots++;
    }
    return out;
  },
};
