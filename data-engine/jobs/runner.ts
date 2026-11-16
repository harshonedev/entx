import { createHash } from "node:crypto";
import type { Collector, CollectorContext } from "../collectors/types";
import type { Db } from "../db/client";

export type JobRunStatus = "ok" | "degraded" | "failed" | "skipped_locked";

/** Stable signed 64-bit advisory-lock key for a job name. */
export const lockKey = (job: string) => createHash("sha256").update(`entx-data-engine:${job}`).digest().readBigInt64BE(0);

/**
 * Run one collector under its advisory lock and record the run in job_runs. A second run of the same job while
 * one is in progress (another container, or a manual CLI run) is recorded as skipped_locked and does nothing.
 */
export async function runJob(db: Db, collector: Collector, ctx: CollectorContext): Promise<JobRunStatus> {
  const outcome = await db.withSessionLock(lockKey(collector.job), async () => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into job_runs (job, status) values ($1, 'running') returning id::text as id",
      [collector.job],
    );
    let status: JobRunStatus;
    try {
      const r = await collector.run(ctx);
      status = r.degraded ? "degraded" : "ok";
      await db.query(
        "update job_runs set status = $2, finished_at = now(), snapshots = $3, skipped = $4, detail = $5 where id = $1",
        [id, status, r.snapshots, r.skipped, r.detail ? JSON.stringify(r.detail) : null],
      );
    } catch (e) {
      status = "failed";
      const message = e instanceof Error ? e.message : String(e);
      ctx.log(`${collector.job} failed`, { error: message });
      await db.query("update job_runs set status = 'failed', finished_at = now(), detail = $2 where id = $1", [
        id,
        JSON.stringify({ error: message }),
      ]);
    }
    return status;
  });
  if (outcome !== null) return outcome;
  await db.query("insert into job_runs (job, status, finished_at) values ($1, 'skipped_locked', now())", [collector.job]);
  return "skipped_locked";
}

/** Mark runs left `running` by a dead process as abandoned. Call once at worker startup. */
export async function abandonStale(db: Db): Promise<number> {
  const rows = await db.query("update job_runs set status = 'abandoned', finished_at = now() where status = 'running' returning id");
  return rows.length;
}
