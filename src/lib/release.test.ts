import { describe, expect, it } from "vitest";
import { nextCatalyst, releaseInfo } from "./release";
import type { AssetSeed } from "./assets";

const base = (over: Partial<AssetSeed> = {}): AssetSeed =>
  ({
    id: "t",
    kind: "movie",
    status: "Streaming",
    releaseDate: "2026-11-01",
    stats: { voteAverage: 7, voteCount: 1, popularity: 1 },
    ...over,
  }) as AssetSeed;

const at = (iso: string) => new Date(iso).getTime();

describe("releaseInfo", () => {
  it("upcoming: days negative, plural and singular labels", () => {
    const r = releaseInfo(base(), at("2026-10-28T12:00:00Z"));
    expect(r.phase).toBe("upcoming");
    expect(r.days).toBe(-4);
    expect(r.label).toBe("Opens in 4 days");
    expect(releaseInfo(base(), at("2026-10-31T12:00:00Z")).label).toBe("Opens tomorrow");
  });

  it("opening week for movies and premiere week for shows", () => {
    expect(releaseInfo(base(), at("2026-11-01T00:00:00Z"))).toMatchObject({ phase: "opening", days: 0, label: "Opening week" });
    expect(releaseInfo(base({ kind: "show" }), at("2026-11-07T23:00:00Z")).label).toBe("Premiere week");
  });

  it("run: week counter for movies and shows", () => {
    expect(releaseInfo(base(), at("2026-11-08T00:00:00Z"))).toMatchObject({ phase: "run", label: "Week 2 in release" });
    expect(releaseInfo(base({ kind: "show" }), at("2026-11-20T00:00:00Z")).label).toBe("Week 3 since premiere");
  });

  it("multi-season shows say season on air", () => {
    const a = base({ kind: "show", stats: { voteAverage: 1, voteCount: 1, popularity: 1, seasons: 4 } });
    expect(releaseInfo(a, at("2026-12-01T00:00:00Z")).label).toBe("Season 4 on air");
  });

  it("formats date in UTC", () => {
    expect(releaseInfo(base(), at("2026-12-01T00:00:00Z")).date).toBe("Nov 1");
  });
});

describe("nextCatalyst", () => {
  // 2026-11-14 is a Saturday (UTC)
  const sat = at("2026-11-14T10:00:00Z");

  it("upcoming movie: opening day if sooner than weekend report", () => {
    const a = base({ releaseDate: "2026-11-15", status: "Upcoming" });
    const c = nextCatalyst(a, [], at("2026-11-13T10:00:00Z")); // Friday: opens in 2 (partial days round up), report Sunday also 2 → opening wins tie
    expect(c).toEqual({ label: "Opening day", days: 2 });
    expect(nextCatalyst(a, [], at("2026-11-11T10:00:00Z"))).toEqual({ label: "Opening day", days: 4 });
  });

  it("in-theaters movie gets weekend box office report", () => {
    const a = base({ status: "In theaters", releaseDate: "2026-10-01" });
    expect(nextCatalyst(a, [], sat)).toEqual({ label: "Weekend box office report", days: 1 });
  });

  it("opening-week movie labels opening-weekend", () => {
    const a = base({ status: "In theaters", releaseDate: "2026-11-12" });
    expect(nextCatalyst(a, [], sat).label).toBe("Opening-weekend box office");
  });

  it("on a Sunday the next report is 7 days out", () => {
    const a = base({ status: "In theaters", releaseDate: "2026-10-01" });
    expect(nextCatalyst(a, [], at("2026-11-15T10:00:00Z")).days).toBe(7);
  });

  it("picks the closest linked prediction deadline", () => {
    const a = base({ status: "In theaters", releaseDate: "2026-10-01" });
    const c = nextCatalyst(
      a,
      [
        { question: "Q far", closesInDays: 30, assetId: "t" },
        { question: "Q near", closesInDays: 0, assetId: "t" },
        { question: "Other asset", closesInDays: -1, assetId: "zzz" },
      ],
      sat,
    );
    expect(c).toEqual({ label: "Q near", days: 0 });
  });

  it("airing show gets weekly streaming charts", () => {
    const a = base({ kind: "show", status: "Airing", releaseDate: "2026-10-01" });
    const c = nextCatalyst(a, [], sat);
    expect(c.label).toBe("Weekly streaming charts");
    expect(c.days).toBeGreaterThan(0);
    expect(c.days).toBeLessThanOrEqual(7);
  });

  it("falls back to weekly streaming charts when nothing else applies", () => {
    const a = base({ status: "Streaming", releaseDate: "2026-01-01" });
    const c = nextCatalyst(a, [], sat);
    expect(c.label).toBe("Weekly streaming charts");
    expect(c.days).toBeGreaterThanOrEqual(1);
    expect(c.days).toBeLessThanOrEqual(7);
  });
});
