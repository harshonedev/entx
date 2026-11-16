// bun engine/cli.ts migrate
// bun engine/cli.ts run <job> [--from YYYY-MM-DD --to YYYY-MM-DD]
// bun engine/cli.ts jobs
import { migrate } from "./db/migrate";
import { COLLECTORS } from "./jobs/schedule";
import { runJob } from "./jobs/runner";
import { createRuntime } from "./runtime";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const day = (s: string | undefined, name: string) => {
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`--${name} must be YYYY-MM-DD`);
  return new Date(`${s}T00:00:00Z`);
};

const usage = "usage: engine migrate | run <job> [--from YYYY-MM-DD --to YYYY-MM-DD] | jobs";

async function main() {
  if (!cmd || !["migrate", "run", "jobs"].includes(cmd)) {
    console.error(usage);
    console.error(`jobs: ${COLLECTORS.map((c) => c.job).join(", ")}`);
    process.exit(2);
  }
  const from = day(flag("from"), "from");
  const to = day(flag("to"), "to");
  if ((from && !to) || (!from && to)) throw new Error("--from and --to go together");
  const { db, ctx } = createRuntime(process.env, from && to ? { from, to } : undefined);
  try {
    if (cmd === "migrate") {
      console.log((await migrate(db)).join("\n") || "up to date");
    } else if (cmd === "run") {
      const c = COLLECTORS.find((x) => x.job === rest[0]);
      if (!c) throw new Error(`unknown job ${rest[0]}; one of ${COLLECTORS.map((x) => x.job).join(", ")}`);
      await migrate(db);
      console.log(await runJob(db, c, ctx));
    } else {
      const rows = await db.query(
        `select distinct on (job) job, status, snapshots, skipped, started_at, finished_at, detail
         from job_runs order by job, started_at desc`,
      );
      console.table(rows);
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
