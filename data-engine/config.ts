export type EngineConfig = {
  databaseUrl: string;
  userAgent: string;
  tmdbToken: string;
  sacnilkEnabled: boolean;
  healthPort: number;
  /** When set, the worker creates/updates the read-only `viewer` role for the database UI. */
  viewerDbPassword: string | null;
};

// Wikimedia blocks generic agents; ours must name the client and a contact, e.g. "entx-data-engine/0.1 (https://entx.space)".
const UA_RE = /^entx-data-engine\/\S+ \(.+\)$/;

export function loadConfig(env: Record<string, string | undefined>): EngineConfig {
  const need = (name: string) => {
    const v = env[name]?.trim();
    if (!v) throw new Error(`${name} is required`);
    return v;
  };
  const userAgent = need("ENGINE_USER_AGENT");
  if (!UA_RE.test(userAgent))
    throw new Error('ENGINE_USER_AGENT must look like "entx-data-engine/<version> (<contact url or email>)"');
  const port = Number(env.ENGINE_HEALTH_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("ENGINE_HEALTH_PORT must be a port number");
  return {
    databaseUrl: need("DATABASE_URL"),
    userAgent,
    tmdbToken: need("TMDB_TOKEN"),
    sacnilkEnabled: env.SACNILK_ENABLED === "true",
    healthPort: port,
    viewerDbPassword: env.VIEWER_DB_PASSWORD?.trim() || null,
  };
}
