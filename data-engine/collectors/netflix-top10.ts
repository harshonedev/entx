import type { HostPolicy } from "../http/polite-fetch";
import { sha256 } from "../evidence/snapshots";
import { snapshotFrom, type Collector, type JobResult } from "./types";

/** Official Netflix Top 10 downloads (verified 2026-11-16). Countries file has ranks only, no views. */
export const NETFLIX_FILES = {
  global: "https://www.netflix.com/tudum/top10/data/all-weeks-global.tsv",
  countries: "https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv",
} as const;

/**
 * Published dataset: Netflix offers these two files as public downloads on the Top 10 page. netflix.com's robots.txt
 * disallows all non-search bots, but we fetch two known files once a week (a download, not a crawl), so robots is not
 * consulted here (user decision 2026-11-16). Never add other netflix.com paths to this collector.
 */
export const NETFLIX_POLICY: Record<string, HostPolicy> = { "www.netflix.com": { minIntervalMs: 2000, api: true, timeoutMs: 300_000 } } // countries file is ~33 MB;

const VERSION = "1";

/** Latest ISO week-ending date in the file, found by the `week` header (column order differs between files). */
export function latestWeek(tsv: string): string | null {
  const lines = tsv.split(/\r?\n/);
  const col = lines[0].split("\t").indexOf("week");
  if (col < 0) return null;
  let max: string | null = null;
  for (const line of lines.slice(1)) {
    const v = line.split("\t")[col];
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && (max === null || v > max)) max = v;
  }
  return max;
}

export const netflixTop10: Collector = {
  job: "netflix.top10",
  provider: "netflix_top10",
  version: VERSION,
  async run(ctx) {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const problems: string[] = [];
    for (const url of [NETFLIX_FILES.global, NETFLIX_FILES.countries]) {
      const res = await ctx.fetch(url);
      if (res.status !== 200) {
        out.skipped++;
        problems.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const [last] = await ctx.db.query<{ payload_hash: string }>(
        "select payload_hash from snapshots where requested_url = $1 order by fetched_at desc limit 1",
        [url],
      );
      if (last?.payload_hash === sha256(res.body)) {
        out.skipped++; // file unchanged since the last run
        continue;
      }
      const week = latestWeek(new TextDecoder().decode(res.body));
      if (!week) problems.push(`${url}: no week column in header`);
      await snapshotFrom(ctx, this, url, res, week ? new Date(`${week}T00:00:00Z`) : null);
      out.snapshots++;
    }
    if (problems.length) {
      out.degraded = true;
      out.detail = { reason: problems.join("; ") };
    }
    return out;
  },
};
