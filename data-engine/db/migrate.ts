import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

const DIR = fileURLToPath(new URL("./migrations", import.meta.url));

/** Apply pending `migrations/*.sql` in name order, each in its own transaction. Returns names applied now. */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (done.has(name)) continue;
    const text = await readFile(join(DIR, file), "utf8");
    await db.tx(async (t) => {
      await t.exec(text);
      await t.query("insert into schema_migrations (name) values ($1)", [name]);
    });
    applied.push(name);
  }
  return applied;
}
