import { parse } from "node-html-parser";
import type { HostPolicy } from "../http/polite-fetch";
import { itemGuard, snapshotFrom, type Collector, type JobResult } from "./types";

// Scraped with the user's go-ahead (2026-11-16) for development; a licence is required before go-live
// (spec §3). Switched off unless SACNILK_ENABLED=true. robots.txt allows /movie/ and listing pages.
export const SACNILK_BASE = "https://www.sacnilk.com";
/** Scraped website: robots.txt honoured, at most one request every 5 s. */
export const SACNILK_POLICY: Record<string, HostPolicy> = { "www.sacnilk.com": { minIntervalMs: 5000 } };

const VERSION = "1";
const DAY = 86_400_000;
const LISTINGS = ["/", "/latest-boxoffice-collection"];
/** A film is treated as in its theatrical run while it still appears on listing pages within this window. */
const RUN_WINDOW_DAYS = 21;
const MOVIE_PATH = /^\/movie\/[A-Za-z0-9_]+_\d{4}$/;

/** Unique movie page paths linked from a Sacnilk page, e.g. "/movie/Jailer_2_2026". */
export function extractMovieKeys(html: string): string[] {
  const keys = new Set<string>();
  for (const a of parse(html).querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    let path: string;
    try {
      path = new URL(href, SACNILK_BASE).pathname;
    } catch {
      continue;
    }
    if (MOVIE_PATH.test(path)) keys.add(path);
  }
  return [...keys];
}

export const sacnilk: Collector = {
  job: "sacnilk.daily",
  provider: "sacnilk",
  version: VERSION,
  async run(ctx) {
    if (!ctx.config.sacnilkEnabled) return { snapshots: 0, skipped: 0, degraded: false, detail: { disabled: true } };
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const now = ctx.now();
    let found = 0;
    const guard = itemGuard(out);

    for (const path of LISTINGS) {
      const url = `${SACNILK_BASE}${path}`;
      const res = await guard(path, () => ctx.fetch(url, { headers: { accept: "text/html" } }));
      if (!res) continue;
      if (res.status !== 200) {
        out.skipped++;
        out.degraded = true;
        continue;
      }
      await snapshotFrom(ctx, this, url, res);
      out.snapshots++;
      const keys = extractMovieKeys(new TextDecoder().decode(res.body));
      found += keys.length;
      for (const key of keys)
        await ctx.db.query(
          `insert into discovered_items (provider, item_key, first_seen_at, last_seen_at) values ('sacnilk', $1, $2, $2)
           on conflict (provider, item_key) do update set last_seen_at = greatest(discovered_items.last_seen_at, excluded.last_seen_at)`,
          [key, now],
        );
    }
    if (found === 0) {
      // Challenge page, redesign or empty listing: keep the evidence, flag the run.
      out.degraded = true;
      out.detail = { ...out.detail, reason: "no movie links" };
    }

    const items = await ctx.db.query<{ item_key: string }>(
      `select item_key from discovered_items where provider = 'sacnilk'
         and (last_seen_at >= $1 or ($2::timestamptz is not null and first_seen_at between $2 and $3))
       order by last_seen_at desc, item_key`,
      [new Date(now.getTime() - RUN_WINDOW_DAYS * DAY), ctx.range?.from ?? null, ctx.range?.to ?? null],
    );
    for (const { item_key } of items) {
      const url = `${SACNILK_BASE}${item_key}`;
      const res = await guard(item_key, () => ctx.fetch(url, { headers: { accept: "text/html" } }));
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
