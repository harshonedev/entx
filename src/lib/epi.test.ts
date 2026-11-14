import { describe, expect, it } from "vitest";
import { computeEpi, EPI_LABELS, EPI_WEIGHTS } from "./epi";

describe("EPI", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(EPI_WEIGHTS).reduce((t, w) => t + w, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it("every weight has a label", () => {
    expect(Object.keys(EPI_LABELS).sort()).toEqual(Object.keys(EPI_WEIGHTS).sort());
  });

  it("uniform parts give that value", () => {
    expect(computeEpi({ boxOffice: 50, streaming: 50, social: 50, critics: 50 })).toBe(50);
    expect(computeEpi({ boxOffice: 100, streaming: 100, social: 100, critics: 100 })).toBe(100);
    expect(computeEpi({ boxOffice: 0, streaming: 0, social: 0, critics: 0 })).toBe(0);
  });

  it("applies weights and rounds to 1 decimal", () => {
    // 80*.35 + 60*.25 + 40*.25 + 20*.15 = 28 + 15 + 10 + 3 = 56
    expect(computeEpi({ boxOffice: 80, streaming: 60, social: 40, critics: 20 })).toBe(56);
    // 33.33*.35 = 11.6655 → rounded to one decimal
    const v = computeEpi({ boxOffice: 33.33, streaming: 0, social: 0, critics: 0 });
    expect(v).toBe(11.7);
  });

  it("box office moves the index most", () => {
    const base = { boxOffice: 50, streaming: 50, social: 50, critics: 50 };
    const bo = computeEpi({ ...base, boxOffice: 60 });
    const cr = computeEpi({ ...base, critics: 60 });
    expect(bo).toBeGreaterThan(cr);
  });
});
