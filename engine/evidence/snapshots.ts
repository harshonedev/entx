import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Db } from "../db/client";

export type SnapshotInput = {
  provider: string;
  job: string;
  requestedUrl: string;
  sourceUrl: string;
  fetchedAt: Date;
  observedAt?: Date | null;
  httpStatus: number;
  contentType: string | null;
  body: Uint8Array;
  collectorVersion: string;
};

/** Days a provider's raw payload may be kept. TMDB terms forbid caching for longer than 6 months. */
export const RETENTION_DAYS: Partial<Record<string, number>> = { tmdb: 180 };

const DAY = 86_400_000;

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Store one fetch as an immutable snapshot: raw bytes hashed, gzipped, with the provider's retention applied. */
export async function recordSnapshot(db: Db, s: SnapshotInput): Promise<{ id: bigint; payloadHash: string }> {
  const payloadHash = sha256(s.body);
  const days = RETENTION_DAYS[s.provider];
  const expiresAt = days === undefined ? null : new Date(s.fetchedAt.getTime() + days * DAY);
  const [row] = await db.query<{ id: string }>(
    `insert into snapshots (provider, job, requested_url, source_url, fetched_at, observed_at, http_status, content_type,
       payload_hash, payload, payload_bytes, payload_expires_at, collector_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning id::text as id`,
    [
      s.provider,
      s.job,
      s.requestedUrl,
      s.sourceUrl,
      s.fetchedAt,
      s.observedAt ?? null,
      s.httpStatus,
      s.contentType,
      payloadHash,
      gzipSync(s.body),
      s.body.byteLength,
      expiresAt,
      s.collectorVersion,
    ],
  );
  return { id: BigInt(row.id), payloadHash };
}

/** Raw (gunzipped) payload, or null when retention has removed it. */
export async function getPayload(db: Db, id: bigint): Promise<Uint8Array | null> {
  const [row] = await db.query<{ payload: Uint8Array | null }>("select payload from snapshots where id = $1", [
    id.toString(),
  ]);
  return row?.payload ? new Uint8Array(gunzipSync(row.payload)) : null;
}

/** Null every payload whose retention has passed. Rows and hashes stay. Returns the number expired. */
export async function expirePayloads(db: Db, now: Date): Promise<number> {
  const rows = await db.query(
    "update snapshots set payload = null where payload is not null and payload_expires_at <= $1 returning id",
    [now],
  );
  return rows.length;
}
