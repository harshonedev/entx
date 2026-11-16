// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const base = {
  DATABASE_URL: "postgres://engine@db/entx",
  ENGINE_USER_AGENT: "entx-data-engine/0.1 (https://entx.space)",
  TMDB_TOKEN: "t",
};

describe("loadConfig", () => {
  it("loads a valid environment with defaults", () => {
    expect(loadConfig(base)).toEqual({
      databaseUrl: base.DATABASE_URL,
      userAgent: base.ENGINE_USER_AGENT,
      tmdbToken: "t",
      sacnilkEnabled: false,
      healthPort: 8080,
    });
  });

  it("rejects missing ENGINE_USER_AGENT", () => {
    expect(() => loadConfig({ ...base, ENGINE_USER_AGENT: undefined })).toThrow(/ENGINE_USER_AGENT/);
  });

  it('rejects generic agent "curl/8"', () => {
    expect(() => loadConfig({ ...base, ENGINE_USER_AGENT: "curl/8" })).toThrow(/ENGINE_USER_AGENT/);
  });

  it("rejects missing DATABASE_URL and TMDB_TOKEN", () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, TMDB_TOKEN: undefined })).toThrow(/TMDB_TOKEN/);
  });

  it('SACNILK_ENABLED only "true" enables', () => {
    expect(loadConfig({ ...base, SACNILK_ENABLED: "true" }).sacnilkEnabled).toBe(true);
    expect(loadConfig({ ...base, SACNILK_ENABLED: "1" }).sacnilkEnabled).toBe(false);
    expect(loadConfig({ ...base, ENGINE_HEALTH_PORT: "9000" }).healthPort).toBe(9000);
  });
});
