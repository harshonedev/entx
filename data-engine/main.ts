// entx-data-engine worker: migrate, recover, schedule collectors, serve /health.
import { createServer } from "node:http";
import { migrate } from "./db/migrate";
import { healthHandler } from "./health";
import { abandonStale } from "./jobs/runner";
import { startScheduler } from "./jobs/schedule";
import { createRuntime, log } from "./runtime";

const { config, db, ctx } = createRuntime(process.env);

const applied = await migrate(db);
if (applied.length) log("migrated", { applied });
const abandoned = await abandonStale(db);
if (abandoned) log("abandoned stale runs", { abandoned });

const scheduler = startScheduler({ db, ctx });
const server = createServer(async (req, res) => {
  const r = req.url?.split("?")[0] === "/health" ? await healthHandler(db) : new Response("not found", { status: 404 });
  res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "text/plain" });
  res.end(await r.text());
});
server.listen(config.healthPort, "0.0.0.0", () => log("engine started", { port: config.healthPort, sacnilk: config.sacnilkEnabled }));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("shutting down", { signal });
  scheduler.stop();
  await Promise.race([Promise.allSettled(scheduler.running()), new Promise((r) => setTimeout(r, 30_000))]);
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
