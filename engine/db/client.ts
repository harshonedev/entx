import postgres from "postgres";

/** Driver-neutral database handle. postgres.js in production, PGlite in tests. */
export interface Db {
  /** One statement with positional parameters ($1, $2, …). */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** One or more statements, no parameters (migrations). */
  exec(text: string): Promise<void>;
  /** Run `fn` inside a transaction; the handle passed in is bound to it. */
  tx<R>(fn: (db: Db) => Promise<R>): Promise<R>;
  /** Run `fn` while holding a session advisory lock; `null` when another session holds it. */
  withSessionLock<R>(key: bigint, fn: () => Promise<R>): Promise<R | null>;
  close(): Promise<void>;
}

type Unsafe = { unsafe: (q: string, p?: never[]) => PromiseLike<unknown> };

function pgHandle(sql: Unsafe & { begin?: unknown }): Pick<Db, "query" | "exec"> {
  return {
    query: async <T,>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as never[])) as unknown as T[],
    exec: async (text: string) => {
      await sql.unsafe(text);
    },
  };
}

export function createPgDb(url: string): Db {
  const sql = postgres(url, { max: 5, onnotice: () => {} });
  const db: Db = {
    ...pgHandle(sql as unknown as Unsafe),
    tx: (fn) =>
      sql.begin((t) => {
        const inner: Db = {
          ...pgHandle(t as unknown as Unsafe),
          tx: (f) => f(inner),
          withSessionLock: () => Promise.reject(new Error("withSessionLock inside a transaction")),
          close: async () => {},
        };
        return fn(inner);
      }) as Promise<never>,
    withSessionLock: async (key, fn) => {
      const reserved = await sql.reserve();
      try {
        const [row] = (await reserved.unsafe("select pg_try_advisory_lock($1) as ok", [key.toString()])) as unknown as {
          ok: boolean;
        }[];
        if (!row.ok) return null;
        try {
          return await fn();
        } finally {
          await reserved.unsafe("select pg_advisory_unlock($1)", [key.toString()]);
        }
      } finally {
        reserved.release();
      }
    },
    close: () => sql.end({ timeout: 5 }),
  };
  return db;
}

/** In-memory Postgres for tests. One connection, so session locks behave per instance. */
export async function createTestDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  type Q = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (t: string) => Promise<unknown> };
  const handle = (q: Q): Pick<Db, "query" | "exec"> => ({
    query: async <T,>(text: string, params: unknown[] = []) => (await q.query(text, params)).rows as T[],
    exec: async (text: string) => {
      await q.exec(text);
    },
  });
  const held = new Set<string>();
  const db: Db = {
    ...handle(pg as unknown as Q),
    tx: (fn) =>
      pg.transaction((t) => {
        const inner: Db = {
          ...handle(t as unknown as Q),
          tx: (f) => f(inner),
          withSessionLock: () => Promise.reject(new Error("withSessionLock inside a transaction")),
          close: async () => {},
        };
        return fn(inner);
      }),
    // PGlite has a single session, so pg_try_advisory_lock is re-entrant there; track holders in-process instead.
    withSessionLock: async (key, fn) => {
      const k = key.toString();
      if (held.has(k)) return null;
      held.add(k);
      try {
        return await fn();
      } finally {
        held.delete(k);
      }
    },
    close: () => pg.close(),
  };
  return db;
}
