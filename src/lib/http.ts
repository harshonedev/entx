// Shared request helpers for public API routes.

/** Max JSON body accepted by the public routes. Their payloads are a few short strings. */
export const MAX_BODY_BYTES = 2_048;

/** Reads a JSON body, refusing anything over `max` bytes before parsing. Returns null when too big or invalid. */
export async function readJson<T>(req: Request, max = MAX_BODY_BYTES): Promise<T | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) as T;
  } catch {
    return null;
  }
}

/**
 * Client IP for rate limiting, or "shared" when no trusted proxy is configured.
 * - Vercel overwrites `x-real-ip`, so it is trusted there.
 * - Behind Traefik (Coolify, TRUST_PROXY=true) the proxy appends the real peer to `x-forwarded-for`, so only the
 *   last hop is trustworthy; anything earlier, and `x-real-ip`, can be set by the client.
 */
export function clientIp(req: Request): string {
  if (process.env.VERCEL) return req.headers.get("x-real-ip") ?? "shared";
  if (process.env.TRUST_PROXY !== "true") return "shared";
  const hops = req.headers.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean);
  return hops?.at(-1) ?? "shared";
}

/** Own-key lookup, so "__proto__" / "constructor" never resolve to inherited values. */
export const own = <T>(table: Record<string, T>, key: unknown): T | undefined =>
  typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined;
