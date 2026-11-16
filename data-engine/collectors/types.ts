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
