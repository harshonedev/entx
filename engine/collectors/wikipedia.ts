import type { HostPolicy } from "../http/polite-fetch";
import { snapshotFrom, type Collector, type JobResult } from "./types";

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

export const wikiPageviews: Collector = {
  job: "wiki.pageviews",
  provider: "wikimedia_pageviews",
  version: VERSION,
  async run(ctx) {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const today = startOfDay(ctx.now());
    // Scheduled: the last 3 complete days (late-arriving data). Backfill: the requested range.
    const from = ctx.range ? new Date(Math.max(ctx.range.from.getTime(), PAGEVIEWS_START.getTime())) : new Date(today.getTime() - 3 * DAY);
    const to = ctx.range ? ctx.range.to : new Date(today.getTime() - DAY);
    for (const l of await wikiLinks(ctx)) {
      const url = pageviewsUrl(l.site, l.article, from, to);
      const res = await ctx.fetch(url, { headers: { accept: "application/json" } });
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
    for (const l of await wikiLinks(ctx)) {
      const url = articleUrl(l.site, l.article);
      const recent = l.release_date !== null && Math.abs(now - Date.parse(l.release_date)) <= 60 * DAY;
      const maxAge = recent ? 20 * 3_600_000 : 7 * DAY; // daily around release, weekly otherwise
      const [last] = await ctx.db.query<{ fetched_at: Date }>(
        "select fetched_at from snapshots where requested_url = $1 order by fetched_at desc limit 1",
        [url],
      );
      if (last && now - new Date(last.fetched_at).getTime() < maxAge) continue;
      const res = await ctx.fetch(url, { headers: { accept: "text/html" } });
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
