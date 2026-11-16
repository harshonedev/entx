// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./db/client";
import { migrate } from "./db/migrate";
import { recordSnapshot } from "./evidence/snapshots";
import { inspectReport } from "./inspect";

const snap = (provider: string, contentType: string, body: string) => ({
  provider,
  job: `${provider}.x`,
  requestedUrl: `https://${provider}.test/a`,
  sourceUrl: `https://${provider}.test/a`,
  fetchedAt: new Date("2026-11-16T00:00:00Z"),
  httpStatus: 200,
  contentType,
  body: new TextEncoder().encode(body),
  collectorVersion: "1",
});

describe("inspectReport", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it("summarises snapshots per provider and decodes one sample each", async () => {
    await recordSnapshot(db, snap("tmdb", "application/json", '{"title":"Ranabaali"}'));
    await recordSnapshot(db, snap("tmdb", "application/json", '{"title":"DNK"}'));
    await recordSnapshot(db, snap("sacnilk", "text/html", "<html><script>x()</script><p>Day 11: ₹75.00 Cr</p></html>"));
    const r = await inspectReport(db, { sampleChars: 100 });
    expect(r.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "tmdb", n: 2 }),
        expect.objectContaining({ provider: "sacnilk", n: 1 }),
      ]),
    );
    const tmdb = r.samples.find((s) => s.provider === "tmdb")!;
    expect(tmdb.text).toBe('{"title":"DNK"}'); // latest per provider
    const sac = r.samples.find((s) => s.provider === "sacnilk")!;
    expect(sac.text).toBe("Day 11: ₹75.00 Cr"); // html reduced to text, scripts dropped
  });

  it("filters to one provider and caps sample length", async () => {
    await recordSnapshot(db, snap("tmdb", "application/json", "x".repeat(500)));
    await recordSnapshot(db, snap("sacnilk", "text/html", "<p>y</p>"));
    const r = await inspectReport(db, { provider: "tmdb", sampleChars: 50 });
    expect(r.samples.map((s) => s.provider)).toEqual(["tmdb"]);
    expect(r.samples[0].text).toHaveLength(50);
  });
});
