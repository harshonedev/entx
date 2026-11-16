// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "../db/client";
import { migrate } from "../db/migrate";
import { expirePayloads, getPayload, recordSnapshot, type SnapshotInput } from "./snapshots";

const DAY = 86_400_000;
const fetchedAt = new Date("2026-11-16T00:00:00Z");
const body = new TextEncoder().encode('{"id":1,"title":"Jailer 2"}');
const input = (provider: string): SnapshotInput => ({
  provider,
  job: `${provider}.test`,
  requestedUrl: "https://example.org/a",
  sourceUrl: "https://example.org/a",
  fetchedAt,
  httpStatus: 200,
  contentType: "application/json",
  body,
  collectorVersion: "1",
});

describe("snapshots", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it("round-trips payload and hash", async () => {
    const { id, payloadHash } = await recordSnapshot(db, input("wikidata"));
    expect(payloadHash).toBe(createHash("sha256").update(body).digest("hex"));
    expect(Buffer.from((await getPayload(db, id))!)).toEqual(Buffer.from(body));
  });

  it("tmdb snapshot expires after 180 days", async () => {
    const { id, payloadHash } = await recordSnapshot(db, input("tmdb"));
    const [row] = await db.query<{ fetched_at: Date; payload_expires_at: Date }>(
      "select fetched_at, payload_expires_at from snapshots where id = $1",
      [id],
    );
    expect(row.payload_expires_at.getTime() - row.fetched_at.getTime()).toBe(180 * DAY);
    expect(await expirePayloads(db, new Date(fetchedAt.getTime() + 181 * DAY))).toBe(1);
    expect(await getPayload(db, id)).toBeNull();
    const [kept] = await db.query<{ payload_hash: string }>("select payload_hash from snapshots where id = $1", [id]);
    expect(kept.payload_hash).toBe(payloadHash);
  });

  it("non-tmdb snapshot never expires", async () => {
    const { id } = await recordSnapshot(db, input("netflix_top10"));
    const [row] = await db.query<{ payload_expires_at: Date | null }>(
      "select payload_expires_at from snapshots where id = $1",
      [id],
    );
    expect(row.payload_expires_at).toBeNull();
    expect(await expirePayloads(db, new Date(fetchedAt.getTime() + 3650 * DAY))).toBe(0);
  });
});
