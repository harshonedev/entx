import { gunzipSync } from "node:zlib";
import type { Db } from "./db/client";

export type InspectReport = {
  snapshots: { provider: string; job: string; n: number; raw_bytes: number; stored_bytes: number; first: string; last: string }[];
  trackedTitles: { role: string; tmdb_kind: string; lang: string; n: number }[];
  titleLinks: { provider: string; n: number }[];
  discoveredItems: { provider: string; n: number }[];
  jobRuns: { job: string; status: string; snapshots: number; skipped: number; started_at: string; detail: string | null }[];
  samples: { id: string; provider: string; url: string; status: number; contentType: string | null; bytes: number; text: string }[];
};

/** HTML → readable text (scripts/styles dropped); other payloads returned as-is. */
const readable = (text: string, contentType: string | null) =>
  contentType?.includes("html")
    ? text
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : text;

/** Read-only overview of the evidence store, with the latest payload per provider decoded. */
export async function inspectReport(db: Db, opts: { provider?: string; sampleChars?: number } = {}): Promise<InspectReport> {
  const chars = opts.sampleChars ?? 1500;
  const provider = opts.provider ?? null;
  const num = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) =>
    rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k])])) })) as T[];

  const snapshots = num(
    await db.query<InspectReport["snapshots"][number]>(
      `select provider, job, count(*) as n, coalesce(sum(payload_bytes), 0) as raw_bytes,
              coalesce(sum(length(payload)), 0) as stored_bytes, min(fetched_at)::text as first, max(fetched_at)::text as last
       from snapshots where ($1::text is null or provider = $1) group by 1, 2 order by 1, 2`,
      [provider],
    ),
    ["n", "raw_bytes", "stored_bytes"],
  );
  const trackedTitles = num(
    await db.query<InspectReport["trackedTitles"][number]>(
      `select role, tmdb_kind, coalesce(origin_language, '?') as lang, count(*) as n
       from tracked_titles group by 1, 2, 3 order by 1, 2, 4 desc`,
    ),
    ["n"],
  );
  const titleLinks = num(
    await db.query<InspectReport["titleLinks"][number]>("select provider, count(*) as n from title_links group by 1 order by 2 desc"),
    ["n"],
  );
  const discoveredItems = num(
    await db.query<InspectReport["discoveredItems"][number]>("select provider, count(*) as n from discovered_items group by 1"),
    ["n"],
  );
  const jobRuns = num(
    await db.query<InspectReport["jobRuns"][number]>(
      `select job, status, snapshots, skipped, started_at::text as started_at, left(detail::text, 200) as detail
       from job_runs order by id desc limit 50`,
    ),
    ["snapshots", "skipped"],
  );
  const rows = await db.query<{ id: string; provider: string; requested_url: string; http_status: number; content_type: string | null; payload_bytes: number; payload: Uint8Array }>(
    `select distinct on (provider) id::text as id, provider, requested_url, http_status, content_type, payload_bytes, payload
     from snapshots where payload is not null and ($1::text is null or provider = $1) order by provider, id desc`,
    [provider],
  );
  const samples = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    url: r.requested_url,
    status: r.http_status,
    contentType: r.content_type,
    bytes: Number(r.payload_bytes),
    text: readable(gunzipSync(r.payload).toString("utf8"), r.content_type).slice(0, chars),
  }));
  return { snapshots, trackedTitles, titleLinks, discoveredItems, jobRuns, samples };
}
