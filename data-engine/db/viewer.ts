import type { Db } from "./client";

// Passwords are interpolated into DDL (roles can't take bind parameters), so allow only a safe alphabet.
const SAFE_PASSWORD = /^[A-Za-z0-9_\-.~]{1,128}$/;

/**
 * Create or update the read-only `viewer` login used by the database UI (pgweb). It can SELECT every table in
 * `public`, including tables added by later migrations, and nothing else.
 */
export async function ensureViewerRole(db: Db, password: string): Promise<void> {
  if (!SAFE_PASSWORD.test(password)) throw new Error("viewer password may only use letters, digits and _ - . ~");
  const [exists] = await db.query("select 1 from pg_roles where rolname = 'viewer'");
  await db.exec(
    `${exists ? "alter" : "create"} role viewer with login nosuperuser nocreatedb nocreaterole noinherit password '${password}';
     grant connect on database ${await currentDb(db)} to viewer;
     grant usage on schema public to viewer;
     grant select on all tables in schema public to viewer;
     alter default privileges in schema public grant select on tables to viewer;
     alter role viewer set default_transaction_read_only = on;`,
  );
}

async function currentDb(db: Db): Promise<string> {
  const [{ name }] = await db.query<{ name: string }>("select quote_ident(current_database()) as name");
  return name;
}
