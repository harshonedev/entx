import type { CollectorContext } from "./collectors/types";
import { loadConfig, type EngineConfig } from "./config";
import { createPgDb, type Db } from "./db/client";
import { createPoliteFetch } from "./http/polite-fetch";
import { DEFAULT_POLICY, HOST_POLICIES } from "./jobs/schedule";

export const log = (msg: string, extra?: object) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

/** Config, database and collector context shared by the worker and the CLI. */
export function createRuntime(env: Record<string, string | undefined>, range?: CollectorContext["range"]) {
  const config: EngineConfig = loadConfig(env);
  const db: Db = createPgDb(config.databaseUrl);
  const ctx: CollectorContext = {
    db,
    fetch: createPoliteFetch({ userAgent: config.userAgent, policies: HOST_POLICIES, defaultPolicy: DEFAULT_POLICY }),
    now: () => new Date(),
    log,
    range,
    config,
  };
  return { config, db, ctx };
}
