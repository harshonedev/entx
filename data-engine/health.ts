import type { Db } from "./db/client";

/** GET /health: 200 with the last finished run per job, 503 when the database is unreachable. */
export async function healthHandler(db: Db): Promise<Response> {
  try {
    const rows = await db.query<{ job: string; status: string; finished_at: Date | null }>(
      `select distinct on (job) job, status, finished_at from job_runs
       where status <> 'skipped_locked' order by job, started_at desc`,
    );
    const jobs = Object.fromEntries(
      rows.map((r) => [r.job, { status: r.status, finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null }]),
    );
    return Response.json({ ok: true, jobs });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
