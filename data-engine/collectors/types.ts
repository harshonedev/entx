import type { EngineConfig } from "../config";
import type { Db } from "../db/client";
import { recordSnapshot } from "../evidence/snapshots";
import type { FetchedResponse, PoliteFetch } from "../http/polite-fetch";

export type JobResult = { snapshots: number; skipped: number; degraded: boolean; detail?: Record<string, unknown> };

export type CollectorContext = {
  db: Db;
  fetch: PoliteFetch;
  now: () => Date;
  log: (msg: string, extra?: object) => void;
  /** Backfill window. Absent for scheduled runs. */
  range?: { from: Date; to: Date };
  config: EngineConfig;
};

export type Collector = {
  job: string;
  provider: string;
  version: string;
  run(ctx: CollectorContext): Promise<JobResult>;
};

/** Store a fetched response as this collector's snapshot. Returns the snapshot id. */
export async function snapshotFrom(
  ctx: CollectorContext,
  c: Pick<Collector, "provider" | "job" | "version">,
  requestedUrl: string,
  res: FetchedResponse,
  observedAt?: Date | null,
): Promise<bigint> {
  const { id } = await recordSnapshot(ctx.db, {
    provider: c.provider,
    job: c.job,
    requestedUrl,
    sourceUrl: res.url,
    fetchedAt: res.fetchedAt,
    observedAt: observedAt ?? null,
    httpStatus: res.status,
    contentType: res.contentType,
    body: res.body,
    collectorVersion: c.version,
  });
  return id;
}

const MAX_CONSECUTIVE_FAILURES = 10;
const MAX_ERRORS_KEPT = 20;

/**
 * Run each item of a collector in isolation: an item that throws (network error after retries, timeout, robots,
 * unparseable body) is skipped, counted and noted in `out.detail.errors`, and the run carries on as degraded.
 * Ten failures in a row mean the source is down, so the run stops there.
 */
export function itemGuard(out: JobResult) {
  let consecutive = 0;
  return async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const value = await fn();
      consecutive = 0;
      return value;
    } catch (e) {
      consecutive++;
      const message = e instanceof Error ? e.message : String(e);
      out.skipped++;
      out.degraded = true;
      const errors = ((out.detail ??= {}).errors ??= []) as string[];
      if (errors.length < MAX_ERRORS_KEPT) errors.push(`${label}: ${message}`);
      if (consecutive >= MAX_CONSECUTIVE_FAILURES) throw new Error(`${consecutive} consecutive failures, last: ${label}: ${message}`);
      return undefined;
    }
  };
}
