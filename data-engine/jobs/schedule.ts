import { Cron } from "croner";
import { NETFLIX_POLICY, netflixTop10 } from "../collectors/netflix-top10";
import { SACNILK_POLICY, sacnilk } from "../collectors/sacnilk";
import { TMDB_POLICY, tmdbDetails, tmdbUniverse } from "../collectors/tmdb";
import type { Collector, CollectorContext } from "../collectors/types";
import { WIKIDATA_POLICY, wikidata } from "../collectors/wikidata";
import { WIKIPEDIA_POLICY, wikiArticles, wikiPageviews } from "../collectors/wikipedia";
import type { Db } from "../db/client";
import { expirePayloads } from "../evidence/snapshots";
import type { HostPolicy } from "../http/polite-fetch";
import { runJob } from "./runner";

export const COLLECTORS: Collector[] = [tmdbUniverse, tmdbDetails, wikidata, wikiPageviews, wikiArticles, netflixTop10, sacnilk];

export const HOST_POLICIES: Record<string, HostPolicy> = {
  ...TMDB_POLICY,
  ...WIKIDATA_POLICY,
  ...WIKIPEDIA_POLICY,
  ...NETFLIX_POLICY,
  ...SACNILK_POLICY,
};
/** Anything not listed: scraped politely, robots honoured. */
export const DEFAULT_POLICY: HostPolicy = { minIntervalMs: 2000 };

/** UTC cron times (spec §6 cadence). Discovery runs before the jobs that read what it found. */
export const SCHEDULE: { collector: Collector | "retention"; cron: string }[] = [
  { collector: "retention", cron: "0 1 * * *" },
  { collector: tmdbUniverse, cron: "15 2 * * *" },
  { collector: tmdbDetails, cron: "30 2 * * *" },
  { collector: wikidata, cron: "0 3 * * 1" },
  { collector: wikiPageviews, cron: "0 4 * * *" },
  { collector: wikiArticles, cron: "30 4 * * *" },
  { collector: sacnilk, cron: "0 6 * * *" },
  { collector: netflixTop10, cron: "0 18 * * 2" },
];

/** Keep `p` in `set` while it runs. The bookkeeping promise never rejects, so a failing job can't crash the worker. */
export function trackInFlight<T>(set: Set<Promise<unknown>>, p: Promise<T>): Promise<T> {
  set.add(p);
  p.finally(() => set.delete(p)).catch(() => {});
  return p;
}

/** Start every scheduled job. `protect` skips a tick while the previous run of that job is still going. */
export function startScheduler(deps: { db: Db; ctx: CollectorContext }): { stop(): void; running(): Promise<unknown>[] } {
  const inFlight = new Set<Promise<unknown>>();
  const crons = SCHEDULE.map(
    (s) =>
      new Cron(s.cron, { timezone: "UTC", protect: true, name: s.collector === "retention" ? "retention" : s.collector.job }, async () => {
        const name = s.collector === "retention" ? "retention" : s.collector.job;
        try {
          await trackInFlight(
            inFlight,
            s.collector === "retention"
              ? expirePayloads(deps.db, deps.ctx.now()).then((n) => deps.ctx.log("retention", { expired: n }))
              : runJob(deps.db, s.collector, deps.ctx).then((status) => deps.ctx.log(`${name} ${status}`)),
          );
        } catch (e) {
          // Database unreachable while starting or recording the run: log it, keep the worker alive for the next tick.
          deps.ctx.log(`${name} crashed`, { error: e instanceof Error ? e.message : String(e) });
        }
      }),
  );
  return { stop: () => crons.forEach((c) => c.stop()), running: () => [...inFlight] };
}
