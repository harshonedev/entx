// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Collector, CollectorContext, JobResult } from "../collectors/types";
import { createTestDb, type Db } from "../db/client";
import { migrate } from "../db/migrate";
import { abandonStale, runJob } from "./runner";

const collector = (run: () => Promise<JobResult>, job = "test.job"): Collector => ({
  job,
  provider: "test",
  version: "1",
  run: () => run(),
});

describe("runJob", () => {
  let db: Db;
  let ctx: CollectorContext;
  beforeEach(async () => {
    db = await createTestDb();
    await migrate(db);
    ctx = { db, fetch: async () => { throw new Error("no fetch"); }, now: () => new Date(), log: () => {}, config: {} as never };
  });
  afterEach(() => db.close());

  const lastRun = async () =>
    (
      await db.query<{ status: string; snapshots: number; skipped: number; detail: Record<string, unknown> | null; finished_at: Date | null }>(
        "select status, snapshots, skipped, detail, finished_at from job_runs order by id desc limit 1",
      )
    )[0];

  it("records ok run with counts", async () => {
    expect(await runJob(db, collector(async () => ({ snapshots: 3, skipped: 1, degraded: false })), ctx)).toBe("ok");
    expect(await lastRun()).toMatchObject({ status: "ok", snapshots: 3, skipped: 1 });
    expect((await lastRun()).finished_at).not.toBeNull();
  });

  it("records degraded when result.degraded", async () => {
    const status = await runJob(db, collector(async () => ({ snapshots: 0, skipped: 2, degraded: true, detail: { reason: "x" } })), ctx);
    expect(status).toBe("degraded");
    expect(await lastRun()).toMatchObject({ status: "degraded", skipped: 2, detail: { reason: "x" } });
  });

  it("records failed with message when run throws", async () => {
    expect(await runJob(db, collector(async () => { throw new Error("boom"); }), ctx)).toBe("failed");
    expect(await lastRun()).toMatchObject({ status: "failed", detail: { error: "boom" } });
  });

  it("second concurrent run of same job is skipped_locked", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = collector(async () => {
      await gate;
      return { snapshots: 1, skipped: 0, degraded: false };
    });
    const first = runJob(db, slow, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(await runJob(db, slow, ctx)).toBe("skipped_locked");
    release();
    expect(await first).toBe("ok");
  });

  it("abandonStale leaves a run whose job lock is still held", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const live = runJob(db, collector(async () => { await gate; return { snapshots: 1, skipped: 0, degraded: false }; }, "live.job"), ctx);
    await new Promise((r) => setTimeout(r, 10));
    await db.query("insert into job_runs (job, status) values ('dead.job', 'running')");
    expect(await abandonStale(db)).toBe(1);
    const rows = await db.query<{ job: string; status: string }>("select job, status from job_runs order by job");
    expect(rows).toEqual([
      { job: "dead.job", status: "abandoned" },
      { job: "live.job", status: "running" },
    ]);
    release();
    await live;
  });

  it("abandonStale marks running rows abandoned", async () => {
    await db.query("insert into job_runs (job, status) values ('x', 'running'), ('y', 'ok')");
    expect(await abandonStale(db)).toBe(1);
    const rows = await db.query<{ job: string; status: string }>("select job, status from job_runs order by job");
    expect(rows).toEqual([
      { job: "x", status: "abandoned" },
      { job: "y", status: "ok" },
    ]);
  });
});
