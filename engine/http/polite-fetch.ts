import { parseRobots } from "./robots";

/**
 * `api: true` marks a documented machine API with its own usage policy (TMDB API, Wikidata Query Service, Wikimedia
 * REST). Their robots.txt files exclude crawlers from those paths, but the APIs exist for automated clients, so robots
 * is not consulted there. Scraped websites never set it.
 */
export type HostPolicy = { minIntervalMs: number; maxRetries?: number; api?: boolean };

export type FetchedResponse = {
  status: number;
  url: string;
  contentType: string | null;
  body: Uint8Array;
  fetchedAt: Date;
};

export type PoliteFetch = (
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: string },
) => Promise<FetchedResponse>;

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

const RETRY_AFTER_CAP_MS = 120_000;

/**
 * fetch that behaves like a good citizen: our User-Agent everywhere, robots.txt honoured, one request at a
 * time per host spaced by the host's policy, and 429/503 retried with Retry-After (capped) or exponential backoff.
 * Other statuses come back as-is; the collector decides what they mean.
 */
export function createPoliteFetch(opts: {
  userAgent: string;
  policies: Record<string, HostPolicy>;
  defaultPolicy: HostPolicy;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): PoliteFetch {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const robots = new Map<string, Promise<(path: string) => boolean>>();
  const queues = new Map<string, Promise<unknown>>();
  const lastAt = new Map<string, number>();

  const policyFor = (host: string): HostPolicy => {
    if (opts.policies[host]) return opts.policies[host];
    const wildcard = Object.keys(opts.policies).find((k) => k.startsWith("*.") && host.endsWith(k.slice(1)));
    return wildcard ? opts.policies[wildcard] : opts.defaultPolicy;
  };

  /** Serialise per host and wait out the host's minimum interval. */
  const slot = <T,>(host: string, fn: () => Promise<T>): Promise<T> => {
    const run = async () => {
      const gap = policyFor(host).minIntervalMs - (now() - (lastAt.get(host) ?? -Infinity));
      if (gap > 0) await sleep(gap);
      try {
        return await fn();
      } finally {
        lastAt.set(host, now());
      }
    };
    const prev = queues.get(host) ?? Promise.resolve();
    const next = prev.then(run, run);
    queues.set(host, next.catch(() => {}));
    return next;
  };

  const raw = (url: string, init?: Parameters<PoliteFetch>[1]) =>
    doFetch(url, {
      method: init?.method ?? "GET",
      body: init?.body,
      headers: { ...init?.headers, "user-agent": opts.userAgent },
      redirect: "follow",
    });

  const robotsFor = (origin: string, host: string) => {
    let p = robots.get(origin);
    if (!p) {
      p = slot(host, async () => {
        try {
          const res = await raw(`${origin}/robots.txt`);
          if (res.status >= 500) return () => false; // unknown rules: stay out this run
          if (!res.ok) return () => true; // no robots.txt: everything allowed
          const parsed = parseRobots(await res.text(), opts.userAgent);
          return (path: string) => parsed.isAllowed(path);
        } catch {
          return () => false;
        }
      });
      robots.set(origin, p);
    }
    return p;
  };

  return async (url, init) => {
    const u = new URL(url);
    if (!policyFor(u.host).api) {
      const allowed = await robotsFor(u.origin, u.host);
      if (!allowed(u.pathname + u.search)) throw new RobotsDisallowedError(url);
    }
    const maxRetries = policyFor(u.host).maxRetries ?? 3;

    for (let attempt = 0; ; attempt++) {
      const res = await slot(u.host, () => raw(url, init));
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2 ** (attempt + 1) * 1000;
        await res.body?.cancel();
        await sleep(Math.min(wait, RETRY_AFTER_CAP_MS));
        continue;
      }
      return {
        status: res.status,
        url: res.url || url,
        contentType: res.headers.get("content-type"),
        body: new Uint8Array(await res.arrayBuffer()),
        fetchedAt: new Date(),
      };
    }
  };
}
