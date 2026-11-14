import { describe, expect, it } from "vitest";
import { ASSETS, ASSET_BY_ID, CATALOG_META, ORACLE_EVENTS, computeEpi, eventsFor } from "./assets";
import { PREDICTIONS } from "./predictions";

describe("catalog data integrity", () => {
  it("has assets with unique ids and tickers", () => {
    expect(ASSETS.length).toBeGreaterThan(0);
    expect(new Set(ASSETS.map((a) => a.id)).size).toBe(ASSETS.length);
    expect(new Set(ASSETS.map((a) => a.ticker)).size).toBe(ASSETS.length);
  });

  it("indexes every asset by id", () => {
    for (const a of ASSETS) expect(ASSET_BY_ID[a.id]).toBe(a);
  });

  it.each(ASSETS.map((a) => [a.id, a] as const))("asset %s is well formed", (_, a) => {
    expect(["movie", "show"]).toContain(a.kind);
    expect(a.basePrice).toBeGreaterThan(0);
    expect(a.volatility).toBeGreaterThan(0);
    expect(a.confidence).toBeGreaterThanOrEqual(0);
    expect(a.confidence).toBeLessThanOrEqual(100);
    expect(a.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(a.releaseDate).getTime())).toBe(false);
    expect(["usd", "views", "pct"]).toContain(a.metric.unit);
    for (const v of Object.values(a.epiParts)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    const epi = computeEpi(a.epiParts);
    expect(epi).toBeGreaterThan(0);
    expect(a.colors).toHaveLength(2);
  });

  it("predictions have unique ids, valid probs, and point at real assets", () => {
    expect(PREDICTIONS.length).toBeGreaterThan(0);
    expect(new Set(PREDICTIONS.map((p) => p.id)).size).toBe(PREDICTIONS.length);
    for (const p of PREDICTIONS) {
      expect(p.yesProb).toBeGreaterThan(0);
      expect(p.yesProb).toBeLessThan(1);
      expect(p.liquidity).toBeGreaterThan(0);
      expect([1, -1]).toContain(p.sensitivity);
      if (p.assetId) expect(ASSET_BY_ID[p.assetId]).toBeDefined();
    }
  });

  it("carries TMDB attribution", () => {
    expect(CATALOG_META.source).toBe("TMDB");
    expect(CATALOG_META.attribution).toMatch(/TMDB/);
  });

  it("oracle events have unique ids, details mention the title", () => {
    expect(new Set(ORACLE_EVENTS.map((e) => e.id)).size).toBe(ORACLE_EVENTS.length);
    const a = ASSETS[0];
    for (const e of ORACLE_EVENTS) {
      expect(e.detail(a)).toContain(a.title);
      expect(e.metricMult).toBeGreaterThan(0);
    }
  });
});

describe("oracle event copy by kind", () => {
  const movie = { ...ASSETS[0], kind: "movie" as const, title: "M" };
  const show = { ...ASSETS[0], kind: "show" as const, title: "S" };
  const ev = (id: string) => ORACLE_EVENTS.find((e) => e.id === id)!;

  it("box office beat: opening weekend for movies, ratings for shows", () => {
    expect(ev("box-office-beat").detail(movie)).toBe("M opening weekend beats tracking by 38%");
    expect(ev("box-office-beat").detail(show)).toBe("S ratings beat projections by 38%");
  });

  it("box office miss: second weekend for movies, viewership for shows", () => {
    expect(ev("box-office-miss").detail(movie)).toBe("M second weekend drops 64%");
    expect(ev("box-office-miss").detail(show)).toBe("S viewership falls 30% week-over-week");
  });

  it("every title has news that fits its release state, both up and down", () => {
    const sum = (e: (typeof ORACLE_EVENTS)[number]) => Object.values(e.delta).reduce((t, v) => t + (v ?? 0), 0);
    for (const a of ASSETS) {
      const fit = eventsFor(a);
      expect(fit.some((e) => sum(e) > 0), `${a.id} lift`).toBe(true);
      expect(fit.some((e) => sum(e) < 0), `${a.id} drop`).toBe(true);
    }
  });
});
