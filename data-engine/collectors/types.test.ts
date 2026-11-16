// @vitest-environment node
import { describe, expect, it } from "vitest";
import { itemGuard, type JobResult } from "./types";

describe("itemGuard", () => {
  it("a throwing item is skipped, counted and the run continues degraded", async () => {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const guard = itemGuard(out);
    expect(await guard("a", async () => 1)).toBe(1);
    expect(await guard("b", async () => { throw new Error("socket closed"); })).toBeUndefined();
    expect(await guard("c", async () => 3)).toBe(3);
    expect(out).toMatchObject({ skipped: 1, degraded: true, detail: { errors: ["b: socket closed"] } });
  });

  it("10 consecutive failures abort the run (host is down)", async () => {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const guard = itemGuard(out);
    for (let i = 0; i < 9; i++) await guard(`i${i}`, async () => { throw new Error("down"); });
    await expect(guard("i9", async () => { throw new Error("down"); })).rejects.toThrow(/10 consecutive failures/);
  });

  it("a success resets the consecutive count", async () => {
    const out: JobResult = { snapshots: 0, skipped: 0, degraded: false };
    const guard = itemGuard(out);
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 9; i++) await guard("x", async () => { throw new Error("flaky"); });
      await guard("ok", async () => true);
    }
    expect(out.skipped).toBe(27);
  });
});
