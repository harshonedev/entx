// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./client";
import { migrate } from "./migrate";

const insertSnapshot = (db: Db) =>
  db.query(
    `insert into snapshots (provider, job, requested_url, source_url, fetched_at, http_status, payload_hash, payload, payload_bytes, collector_version)
     values ('tmdb', 't', 'u', 'u', now(), 200, 'h', '\\x00'::bytea, 1, 'v1')`,
  );

describe("migrate", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.close();
  });

  it("applies 001 once and is idempotent", async () => {
    expect(await migrate(db)).toEqual(["001_evidence"]);
    expect(await migrate(db)).toEqual([]);
  });

  it("snapshot delete is rejected", async () => {
    await migrate(db);
    await insertSnapshot(db);
    await expect(db.query("delete from snapshots")).rejects.toThrow(/immutable/);
  });

  it("snapshot update of anything but payload is rejected", async () => {
    await migrate(db);
    await insertSnapshot(db);
    await expect(db.query("update snapshots set http_status = 500")).rejects.toThrow(/immutable/);
    await db.query("update snapshots set payload = null");
    const rows = await db.query<{ payload: unknown }>("select payload from snapshots");
    expect(rows[0].payload).toBeNull();
  });
});
