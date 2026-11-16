# EPI Engine Phase 1: Evidence Collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A long-running `entx-engine` worker that, on a schedule, fetches raw evidence from TMDB, Wikidata, Wikipedia (pageviews + article HTML), Netflix Top 10 and Sacnilk, and stores every fetch as an immutable, hashed snapshot in Postgres.

**Architecture:** New `engine/` tree in this repo, run by Bun in its own container. A thin `Db` interface hides the driver (postgres.js in production, PGlite in tests). Each collector = plan requests → polite fetch → `recordSnapshot` → optional discovery of follow-up work (title links, Sacnilk movie pages). A scheduler runs jobs under a Postgres advisory lock and logs every run in `job_runs`. No normalisation, trust or scoring yet (phases 2–4).

**Tech Stack:** Bun 1.3 (runtime + package manager), TypeScript, `postgres` (postgres.js), `@electric-sql/pglite` (tests only), `croner` (scheduling), `node-html-parser` (Sacnilk link discovery), vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-16-epi-data-engine-design.md` (§5 layout, §6 collectors/evidence/cadence/universe, §3 licensing, §12 security, §10 phase 1 + environments).

## Global Constraints

- Work on branch `feat/epi-data-engine`. Never merge to `main` during this plan (judging freeze; main auto-deploys three production hosts).
- Snapshots are never updated or deleted; the only allowed update is nulling `payload` (retention). Enforced in the database, not only in code.
- TMDB retention: payload nulled after **180 days** (`payload_expires_at = fetched_at + 180 days`).
- Every outbound request sends `ENGINE_USER_AGENT` (format `entx-engine/<version> (<contact url or email>)`). Worker refuses to start without it. Wikimedia returns 403 to generic agents.
- robots.txt is honoured for every host; disallowed paths are never requested.
- Sacnilk: **≤ 1 request / 5 s**, never `/api/` or `/search`, whole collector off unless `SACNILK_ENABLED=true`.
- Wikidata SPARQL: ≤ 1 concurrent query, back off on 429 using `Retry-After`.
- Secrets (`TMDB_TOKEN`, `DATABASE_URL`) only from env; nothing `NEXT_PUBLIC_`.
- Engine code must not import from `src/` except `src/data/catalog.json` (read-only seed list). Engine tests run in the `node` vitest environment.
- Use `bun` for every script (`bun add`, `bun run`). Commit messages: conventional commits, no Co-Authored-By trailer.

## Review Focus

1. **Soft-failure pages** (Cloudflare challenge, empty Sacnilk listing, HTML redesign) arrive as HTTP 200. Expected: the snapshot is still stored, but discovery that finds 0 items marks the job run `degraded`, not `ok`. → Task 9 test `listing with no movie links marks run degraded`.
2. **Non-ASCII and punctuated Wikipedia titles** (Devanagari, `/`, `?`, spaces). Expected: pageviews URL uses underscores and `encodeURIComponent` per segment and still hits the right article. → Task 7 test `encodes Devanagari and slash titles`.
3. **Worker restarted mid-job, or two containers running.** Expected: the advisory lock stops a second concurrent run; `running` rows left by a dead process are marked `abandoned` at startup. → Task 4 tests.
4. **429 / 503 with `Retry-After`, and robots-disallowed paths.** Expected: wait as told (capped), retry ≤ 3 times, never request a disallowed path. → Task 3 tests.
5. **One bad title (TMDB 404, no Wikidata item, deleted article).** Expected: skipped and counted, the job continues and ends `degraded` with the count, not crashed. → Task 5 test `404 title is skipped and job continues`.

---

## File map

```
engine/
  db/client.ts               Db interface, postgres.js + PGlite adapters
  db/migrate.ts              migration runner
  db/migrations/001_evidence.sql
  evidence/snapshots.ts      recordSnapshot, expirePayloads, getPayload
  http/polite-fetch.ts       UA, per-host rate limit, retry/backoff, robots
  http/robots.ts             robots.txt parse + allow check
  jobs/runner.ts             runJob (advisory lock + job_runs), abandonStale
  jobs/schedule.ts           job table (cron expressions) + startScheduler
  collectors/types.ts        Collector, CollectorContext, JobResult
  collectors/tmdb.ts         universe seeding + details
  collectors/wikidata.ts     QID, sitelinks, P2142 via SPARQL
  collectors/wikipedia.ts    pageviews + article HTML
  collectors/netflix-top10.ts
  collectors/sacnilk.ts
  config.ts                  env parsing (zero NEXT_PUBLIC)
  cli.ts                     `bun engine/cli.ts migrate|run <job> [--from --to]`
  main.ts                    worker: config → migrate → abandonStale → scheduler → /health
  fixtures/                  recorded payloads (tmdb, wikidata, pageviews, netflix, sacnilk)
  **/*.test.ts
Dockerfile.engine
```

Modify: `package.json` (deps, scripts), `vitest.config.mts` (include `engine/**/*.test.ts`), `tsconfig.json` (keep `engine` included; it is by default), `docs/deploy-coolify.md` (engine section), `MILESTONE.md` (M1 rewrite).

---

### Task 1: Db layer, migrations, evidence schema

**Files:**
- Create: `engine/db/client.ts`, `engine/db/migrate.ts`, `engine/db/migrations/001_evidence.sql`, `engine/db/migrate.test.ts`
- Modify: `package.json`, `vitest.config.mts`, `MILESTONE.md`

**Interfaces:**
- Produces:
  - `interface Db { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; tx<R>(fn: (db: Db) => Promise<R>): Promise<R>; withSessionLock<R>(key: bigint, fn: () => Promise<R>): Promise<R | null>; close(): Promise<void> }` (`withSessionLock` returns `null` when `pg_try_advisory_lock` fails)
  - `createPgDb(url: string): Db` (postgres.js; `withSessionLock` uses `sql.reserve()` so lock and unlock share one connection)
  - `createTestDb(): Promise<Db>` (PGlite in-memory)
  - `migrate(db: Db): Promise<string[]>` (returns names applied this call)

Schema in `001_evidence.sql`:

```sql
create table schema_migrations (name text primary key, applied_at timestamptz not null default now());

create table snapshots (
  id bigserial primary key,
  provider text not null,
  job text not null,
  requested_url text not null,
  source_url text not null,
  fetched_at timestamptz not null,
  observed_at timestamptz,
  http_status int not null,
  content_type text,
  payload_hash text not null,            -- sha256 hex of raw (uncompressed) bytes
  payload bytea,                          -- gzip; null after retention
  payload_bytes int not null,
  payload_expires_at timestamptz,
  collector_version text not null
);
create index snapshots_provider_fetched on snapshots (provider, fetched_at desc);
create index snapshots_hash on snapshots (payload_hash);

-- immutability: no delete; update may only null payload
create function snapshots_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'snapshots are immutable'; end if;
  if (new.payload is not null) or (row(new.id,new.provider,new.job,new.requested_url,new.source_url,new.fetched_at,
      new.observed_at,new.http_status,new.content_type,new.payload_hash,new.payload_bytes,new.payload_expires_at,
      new.collector_version) is distinct from row(old.id,old.provider,old.job,old.requested_url,old.source_url,
      old.fetched_at,old.observed_at,old.http_status,old.content_type,old.payload_hash,old.payload_bytes,
      old.payload_expires_at,old.collector_version)) then
    raise exception 'snapshots are immutable (only payload may be nulled)';
  end if;
  return new;
end $$;
create trigger snapshots_immutable before update or delete on snapshots for each row execute function snapshots_guard();

create table tracked_titles (
  id bigserial primary key,
  tmdb_kind text not null check (tmdb_kind in ('movie','tv')),
  tmdb_id int not null,
  role text not null check (role in ('market','watch','cohort')),
  origin_language text,
  release_date date,
  added_at timestamptz not null default now(),
  unique (tmdb_kind, tmdb_id)
);

create table title_links (            -- provider ids discovered from evidence; phase 2 resolver builds on these
  tracked_title_id bigint not null references tracked_titles(id),
  provider text not null,             -- 'imdb' | 'wikidata' | 'wiki:enwiki' | 'wiki:hiwiki' | ...
  external_id text not null,          -- tt..., Q..., article title
  snapshot_id bigint not null references snapshots(id),
  discovered_at timestamptz not null default now(),
  primary key (tracked_title_id, provider)
);

create table discovered_items (       -- provider pages found by crawling, not yet matched to titles (Sacnilk)
  provider text not null,
  item_key text not null,             -- e.g. '/movie/Jailer_2_2026'
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (provider, item_key)
);

create table job_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','ok','degraded','failed','abandoned','skipped_locked')),
  snapshots int not null default 0,
  skipped int not null default 0,
  detail jsonb
);
```

- [ ] **Step 1: Add deps and test wiring.** `bun add postgres croner node-html-parser` and `bun add -d @electric-sql/pglite`. In `vitest.config.mts` change `include` to `["src/**/*.test.{ts,tsx}", "engine/**/*.test.ts"]`. Add scripts: `"engine": "bun engine/cli.ts"`, `"engine:worker": "bun engine/main.ts"`.
- [ ] **Step 2: Write failing tests** in `engine/db/migrate.test.ts` (first line `// @vitest-environment node`):
  - `applies 001 once and is idempotent`: first `migrate(db)` returns `["001_evidence"]`, second returns `[]`.
  - `snapshot delete is rejected`: insert a row, `delete from snapshots` rejects with /immutable/.
  - `snapshot update of anything but payload is rejected`: `update snapshots set http_status = 500` rejects; `update snapshots set payload = null` succeeds.
- [ ] **Step 3: Run** `bun run test engine/db` → FAIL (modules missing).
- [ ] **Step 4: Implement** `client.ts`, `migrate.ts` (reads `migrations/*.sql` sorted, each in its own `tx`, records name), and the SQL above.
- [ ] **Step 5: Run** `bun run test engine/db` → PASS. Also `bun run test` (whole suite) → still green.
- [ ] **Step 6: Rewrite M1 in `MILESTONE.md`** as "M1 — EPI data engine `P1`" with one checkbox per spec phase 1–6 (phase 7 → new backlog row "NEAR attestation of EPI reports, blocked on licences, P1"), keep the exit gate line, add backlog rows for the go-live licence list (Sacnilk, TMDB commercial, IMDb Data) at P0 "before go-live", and a changelog line dated 2026-11-16 referencing the spec.
- [ ] **Step 7: Commit** `feat(engine): db layer and evidence schema`.

### Task 2: Evidence store

**Files:** Create `engine/evidence/snapshots.ts`, `engine/evidence/snapshots.test.ts`

**Interfaces:**
- Consumes: `Db`, `createTestDb`, `migrate` (Task 1)
- Produces:
  - `type SnapshotInput = { provider: string; job: string; requestedUrl: string; sourceUrl: string; fetchedAt: Date; observedAt?: Date | null; httpStatus: number; contentType: string | null; body: Uint8Array; collectorVersion: string }`
  - `RETENTION_DAYS: Partial<Record<string, number>> = { tmdb: 180 }`
  - `recordSnapshot(db: Db, s: SnapshotInput): Promise<{ id: bigint; payloadHash: string }>` (sha256 of raw bytes; gzip via `Bun.gzipSync`/`node:zlib`; sets `payload_expires_at` from `RETENTION_DAYS`)
  - `getPayload(db: Db, id: bigint): Promise<Uint8Array | null>` (gunzipped)
  - `expirePayloads(db: Db, now: Date): Promise<number>` (nulls payloads with `payload_expires_at <= now`, returns count)

- [ ] **Step 1: Failing tests:**
  - `round-trips payload and hash`: hash equals sha256 hex of input; `getPayload` returns identical bytes.
  - `tmdb snapshot expires after 180 days`: `payload_expires_at - fetched_at = 180 days`; `expirePayloads(db, fetchedAt + 181d)` returns 1, `getPayload` → null, row and `payload_hash` still present.
  - `non-tmdb snapshot never expires`: `payload_expires_at` is null; `expirePayloads` returns 0.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): immutable snapshot store with retention`.

### Task 3: Polite fetch + robots

**Files:** Create `engine/http/robots.ts`, `engine/http/polite-fetch.ts`, `engine/http/polite-fetch.test.ts`

**Interfaces:**
- Produces:
  - `parseRobots(txt: string, agent: string): { isAllowed(path: string): boolean }` (groups by `User-agent`; agent token = text before `/` in UA; falls back to `*`; longest-match wins, `Allow` beats `Disallow` on equal length; `*` and `$` wildcards)
  - `type HostPolicy = { minIntervalMs: number; maxRetries?: number }`
  - `createPoliteFetch(opts: { userAgent: string; policies: Record<string, HostPolicy>; defaultPolicy: HostPolicy; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number }): PoliteFetch`
  - `type PoliteFetch = (url: string, init?: { headers?: Record<string, string>; method?: string; body?: string }) => Promise<FetchedResponse>`
  - `type FetchedResponse = { status: number; url: string; contentType: string | null; body: Uint8Array; fetchedAt: Date }`
  - `class RobotsDisallowedError extends Error`
- Behaviour: one in-flight request per host, spaced by `minIntervalMs`; robots.txt fetched once per host per process (404 → allow all; 5xx → disallow all for this run); 429/503 retried up to `maxRetries` (default 3) waiting `Retry-After` seconds (cap 120 s) or exponential 2^n s; other statuses returned as-is (collector decides).

- [ ] **Step 1: Failing tests** (fake `fetchImpl`, fake `sleep` recording waits):
  - `sends the configured User-Agent on every request incl robots.txt`.
  - `robots disallow throws before request`: robots `User-agent: *\nDisallow: /api/` → fetching `/api/x` throws `RobotsDisallowedError`, fake fetch saw only `/robots.txt`.
  - `honours Retry-After on 429 then succeeds`: responses 429 (`Retry-After: 7`), 200 → sleeps include 7000, returns 200.
  - `gives up after 3 retries`: four 503s → returns status 503, exactly 4 calls to the URL.
  - `spaces same-host requests by minIntervalMs`: two calls with policy 5000 ms → second waits ≥ 5000.
  - `parseRobots longest match`: `Disallow: /movie/` + `Allow: /movie/x` → `/movie/x` allowed, `/movie/y` not.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): polite fetch with robots and backoff`.

### Task 4: Job runner, collector contract, config

**Files:** Create `engine/jobs/runner.ts`, `engine/collectors/types.ts`, `engine/config.ts`, `engine/jobs/runner.test.ts`, `engine/config.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 1), `PoliteFetch` (Task 3), `recordSnapshot` (Task 2)
- Produces:
  - `type JobResult = { snapshots: number; skipped: number; degraded: boolean; detail?: Record<string, unknown> }`
  - `type CollectorContext = { db: Db; fetch: PoliteFetch; now: () => Date; log: (msg: string, extra?: object) => void; range?: { from: Date; to: Date }; config: EngineConfig }`
  - `type Collector = { job: string; provider: string; version: string; run(ctx: CollectorContext): Promise<JobResult> }`
  - `snapshotFrom(ctx: CollectorContext, c: Pick<Collector, "provider" | "job" | "version">, requestedUrl: string, res: FetchedResponse, observedAt?: Date | null): Promise<bigint>` (wraps `recordSnapshot`)
  - `runJob(db: Db, collector: Collector, ctx: CollectorContext): Promise<JobRunStatus>` where `JobRunStatus = 'ok' | 'degraded' | 'failed' | 'skipped_locked'`. Lock key = stable 64-bit hash of `collector.job`. Writes a `job_runs` row: `running` → final status with counts; thrown error → `failed` with `detail.error` message (no stack secrets).
  - `abandonStale(db: Db): Promise<number>` (`running` rows → `abandoned`, `finished_at = now()`)
  - `type EngineConfig = { databaseUrl: string; userAgent: string; tmdbToken: string; sacnilkEnabled: boolean; healthPort: number }`, `loadConfig(env: Record<string, string | undefined>): EngineConfig` (throws naming the missing var; `ENGINE_USER_AGENT` must match `/^entx-engine\/\S+ \(.+\)$/`; `healthPort` default 8080)

- [ ] **Step 1: Failing tests:**
  - `records ok run with counts`, `records degraded when result.degraded`, `records failed with message when run throws`.
  - `second concurrent run of same job is skipped_locked`: start a run whose `run` awaits a gate; start a second → `skipped_locked`; release gate → first `ok`.
  - `abandonStale marks running rows abandoned`.
  - `loadConfig rejects missing ENGINE_USER_AGENT` and `rejects generic agent "curl/8"`; `SACNILK_ENABLED` only `"true"` enables.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): job runner, collector contract, config`.

### Task 5: TMDB collector (universe + details)

**Files:** Create `engine/collectors/tmdb.ts`, `engine/collectors/tmdb.test.ts`, `engine/fixtures/tmdb/*.json`

**Interfaces:**
- Consumes: Task 4 contract
- Produces:
  - `tmdbUniverse: Collector` (job `tmdb.universe`): upserts `tracked_titles`:
    - `role='market'`: every asset in `src/data/catalog.json` (`kind` movie→`movie`, show→`tv`, `tmdbId`).
    - `role='watch'`: `/discover/movie` for `with_original_language` ∈ `hi,te,ta,ml,kn,bn,mr`, `primary_release_date.gte = today−120d`, `lte = today+90d`, pages 1–3 each; `/discover/tv` same languages, `first_air_date.gte = today−365d`, page 1.
    - `role='cohort'` only when `ctx.range` is given (backfill): `/discover/movie` for those languages and for `region=US` + `with_original_language=en`, release dates within the range, pages 1–5 per month.
    - Never downgrades a role (`market` > `watch` > `cohort`). Every discover response is snapshotted.
  - `tmdbDetails: Collector` (job `tmdb.details`): for every tracked title with role `market` or `watch` (and `cohort` when `ctx.range` set), GET `/movie/{id}?append_to_response=release_dates,external_ids` or `/tv/{id}?append_to_response=external_ids`; snapshot; upsert `title_links` for `imdb` (`imdb_id`) and `wikidata` (`wikidata_id`) when present. 404 → skipped++, continue.
  - Auth header `Authorization: Bearer ${config.tmdbToken}`; host policy `api.themoviedb.org` 250 ms.

- [ ] **Step 1: Record fixtures** with the real token: one movie detail (an Indian film with `wikidata_id`), one tv detail, one discover page. Strip nothing (public data). Save under `engine/fixtures/tmdb/`.
- [ ] **Step 2: Failing tests** (fake fetch serving fixtures, PGlite):
  - `universe seeds 17 market titles from catalog.json`.
  - `universe adds Indian discover results as watch, keeps market role on overlap`.
  - `details writes imdb and wikidata links with snapshot id`.
  - `404 title is skipped and job continues`: one 404 among three → `skipped: 1`, `degraded: true`, two snapshots with links.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(engine): TMDB universe and details collectors`.

### Task 6: Wikidata collector

**Files:** Create `engine/collectors/wikidata.ts`, `engine/collectors/wikidata.test.ts`, `engine/fixtures/wikidata/*.json`

**Interfaces:**
- Produces: `wikidata: Collector` (job `wikidata.items`). Batches tracked titles (≤ 50 per query) that have a TMDB id, queries `https://query.wikidata.org/sparql` (POST, `Accept: application/sparql-results+json`) matching `wdt:P4947` (movie) / `wdt:P4983` (tv) values, returning `?item`, `P345`, `P2142` (amount + unit + `pq:P585` point in time + reference URL `pr:P854` when present), and sitelinks for `enwiki, hiwiki, tawiki, tewiki, mlwiki, knwiki, bnwiki, mrwiki`. One snapshot per query. Upserts `title_links` `wikidata` (QID) and `wiki:<site>` (article title, spaces not underscores).
- Host policy `query.wikidata.org` 1000 ms, `maxRetries` 3.
- Exported pure helper `buildSparql(movieIds: number[], tvIds: number[]): string` and `parseBindings(json): Array<{ tmdbKind; tmdbId; qid; imdb?; sitelinks: Record<string, string> }>`.

- [ ] **Step 1: Record fixture** by running `buildSparql` for 3 catalogue ids against the live endpoint with the real UA.
- [ ] **Step 2: Failing tests:** `buildSparql includes both id sets`, `parseBindings maps sitelinks per wiki`, `collector writes wiki:hiwiki link for a Hindi film`, `title with no item is counted skipped, not failed`.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(engine): Wikidata collector`.

### Task 7: Wikipedia collectors (pageviews + article HTML)

**Files:** Create `engine/collectors/wikipedia.ts`, `engine/collectors/wikipedia.test.ts`, `engine/fixtures/wikipedia/*`

**Interfaces:**
- Produces:
  - `pageviewsUrl(site: string, article: string, from: Date, to: Date): string` → `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/all-access/user/{encoded}/daily/{YYYYMMDD}/{YYYYMMDD}` where `project` = `en.wikipedia.org` for `enwiki` (strip `wiki`, append `.wikipedia.org`), `encoded = encodeURIComponent(article.replaceAll(" ", "_"))`.
  - `wikiPageviews: Collector` (job `wiki.pageviews`): every `wiki:*` link; range = last 3 days (late data) or `ctx.range` in backfill (from ≥ 2015-07-01). 404 (no data yet) → skipped.
  - `wikiArticles: Collector` (job `wiki.articles`): `enwiki` + Indian-language links; GET `https://{lang}.wikipedia.org/api/rest_v1/page/html/{encoded}`; snapshot only (infobox parsing is phase 2). Daily for titles whose `release_date` is within 60 days, else weekly (job decides by `now` and last snapshot age).
- Host policies: `wikimedia.org` 200 ms, `*.wikipedia.org` 500 ms.

- [ ] **Step 1: Failing tests:**
  - `encodes Devanagari and slash titles`: `pageviewsUrl("hiwiki", "जवान (फ़िल्म)", …)` contains `hi.wikipedia.org` and `%E0%A4%9C`; `"AC/DC"` → `AC%2FDC`; `"Jailer 2"` → `Jailer_2`.
  - `pageviews collects last 3 days by default and backfill range when given` (assert requested URLs).
  - `article job skips titles snapshotted < 7 days ago unless released within 60 days`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): Wikipedia pageviews and article collectors`.

### Task 8: Netflix Top 10 collector

**Files:** Create `engine/collectors/netflix-top10.ts`, `engine/collectors/netflix-top10.test.ts`, `engine/fixtures/netflix/*.tsv` (first 50 lines of each real file)

**Interfaces:**
- Produces: `netflixTop10: Collector` (job `netflix.top10`). GETs (verified 2026-11-16, both `text/tab-separated-values`):
  - `https://www.netflix.com/tudum/top10/data/all-weeks-global.tsv` columns `week, category, weekly_rank, show_title, season_title, weekly_hours_viewed, runtime, weekly_views, cumulative_weeks_in_top_10` (~0.9 MB)
  - `https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv` columns `country_name, country_iso2, week, category, weekly_rank, show_title, season_title, cumulative_weeks_in_top_10` (~33 MB; ranks only, no views)
  - `observed_at` = max `week` in the file. Skip the snapshot (`skipped++`, not degraded) when the new `payload_hash` equals the latest stored hash for that URL (file unchanged since last run).
  - Pure helper `latestWeek(tsv: string): string` (reads `week` column by header name, not position).
- [ ] **Step 1: Failing tests:** `latestWeek finds max week by header name in both files`, `unchanged file is not re-snapshotted`, `header missing week column marks degraded`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (stream not required; 33 MB fits memory). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): Netflix Top 10 collector`.

### Task 9: Sacnilk collector

**Files:** Create `engine/collectors/sacnilk.ts`, `engine/collectors/sacnilk.test.ts`, `engine/fixtures/sacnilk/{home,latest,movie}.html`

**Interfaces:**
- Produces:
  - `extractMovieKeys(html: string): string[]` — unique `href` paths matching `^/movie/[A-Za-z0-9_]+_\d{4}$` (observed 2026-11-16, e.g. `/movie/Jailer_2_2026`).
  - `sacnilk: Collector` (job `sacnilk.daily`). Returns `{snapshots:0, skipped:0, degraded:false, detail:{disabled:true}}` immediately unless `config.sacnilkEnabled`. Otherwise: GET `/` and `/latest-boxoffice-collection`, snapshot both, upsert `discovered_items` (bump `last_seen_at`); then GET each item with `last_seen_at` within 21 days (in theatrical run); snapshot each. Backfill (`ctx.range`): also items first seen inside the range. Host policy `www.sacnilk.com` **5000 ms**.
  - 0 movie keys found across both listing pages → `degraded: true, detail.reason = "no movie links"`.
- [ ] **Step 1: Record fixtures** (one request each, by hand with the real UA, respecting 5 s spacing).
- [ ] **Step 2: Failing tests:** `extractMovieKeys finds /movie/ links and ignores records pages`, `disabled flag makes no requests`, `listing with no movie links marks run degraded`, `only items seen in last 21 days are fetched`, `host policy for sacnilk is 5000 ms` (assert from exported policy table).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(engine): Sacnilk collector behind SACNILK_ENABLED`.

### Task 10: Scheduler, CLI, worker, container

**Files:** Create `engine/jobs/schedule.ts`, `engine/cli.ts`, `engine/main.ts`, `engine/jobs/schedule.test.ts`, `Dockerfile.engine`; Modify `docs/deploy-coolify.md`

**Interfaces:**
- Consumes: every collector, `runJob`, `abandonStale`, `migrate`, `expirePayloads`, `createPoliteFetch`, `loadConfig`
- Produces:
  - `SCHEDULE: Array<{ collector: Collector | "retention"; cron: string }>` (UTC):
    - `tmdb.universe` `15 2 * * *`; `tmdb.details` `30 2 * * *`; `wikidata.items` `0 3 * * 1` (weekly Mon); `wiki.pageviews` `0 4 * * *`; `wiki.articles` `30 4 * * *`; `netflix.top10` `0 18 * * 2` (Tue); `sacnilk.daily` `0 6 * * *` (after Indian overnight updates); `retention` (`expirePayloads`) `0 1 * * *`.
  - `startScheduler(deps): { stop(): void }` using `croner` with `protect: true`.
  - CLI: `bun engine/cli.ts migrate`, `bun engine/cli.ts run <job> [--from YYYY-MM-DD --to YYYY-MM-DD]`, `bun engine/cli.ts jobs` (last run per job).
  - Worker `main.ts`: `loadConfig(process.env)` → `migrate` → `abandonStale` → `startScheduler` → HTTP `GET /health` on `healthPort` returning `200 {"ok":true,"jobs":{<job>:{status,finishedAt}}}`, `503` if DB unreachable. SIGTERM: stop scheduler, wait for running job ≤ 30 s, close DB.
- [ ] **Step 1: Failing tests:** `every collector appears in SCHEDULE exactly once`, `every cron expression parses` (via `croner`), `health returns 503 when db query throws`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: `Dockerfile.engine`:** `oven/bun:1.3` base; `bun install --frozen-lockfile --production`; copy `engine/`, `src/data/catalog.json`, `package.json`; non-root user; `EXPOSE 8080`; `HEALTHCHECK` on `/health`; `CMD ["bun","engine/main.ts"]`. Verify: `docker build -f Dockerfile.engine -t entx-engine .` succeeds (skip with a note if Docker isn't available locally; Coolify build is the real check in Task 11).
- [ ] **Step 6: Local end-to-end smoke:** with a local Postgres (`docker run -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:17`) run `bun run engine migrate` then `bun run engine run tmdb.universe`, `tmdb.details`, `wikidata.items`, `wiki.pageviews`, `netflix.top10`; `bun run engine jobs` shows each `ok` or `degraded` with counts. Sacnilk: one run with `SACNILK_ENABLED=true`.
- [ ] **Step 7: Docs:** add "Engine (dev environment)" to `docs/deploy-coolify.md`: env vars `DATABASE_URL`, `ENGINE_USER_AGENT`, `TMDB_TOKEN`, `SACNILK_ENABLED`, `ENGINE_HEALTH_PORT`; build pack Dockerfile `Dockerfile.engine`; branch `feat/epi-data-engine`; no domain needed; backfill commands.
- [ ] **Step 8: Run** `bun run test`, `bun run lint`, `bunx tsc --noEmit` → all clean. **Commit** `feat(engine): scheduler, CLI, worker and container`.

### Task 11: Coolify dev environment (ops, needs working Coolify MCP token)

- [ ] **Step 1:** In project ENTX (`k6spytth06wuqzqkcm5htdfx`) create environment `dev`. Do not touch the `production` environment or its three apps.
- [ ] **Step 2:** Create PostgreSQL 17 database `entx-dev-db` in `dev`, not publicly exposed. Create roles: `engine` (owner of schema) and `app_ro` (read-only, for phase 4 API).
- [ ] **Step 3:** Create application `entx-engine` in `dev`: source = public GitHub repo, branch `feat/epi-data-engine`, build pack Dockerfile, `Dockerfile.engine`, no domain, health check path `/health` port 8080. Env: `DATABASE_URL` (internal URL, `engine` role), `ENGINE_USER_AGENT=entx-engine/0.1 (https://entx.space)`, `TMDB_TOKEN` (ask the user to paste it into Coolify themselves, never into chat), `SACNILK_ENABLED=true` (user decision 2026-11-16).
- [ ] **Step 4:** Deploy. Verify: deploy succeeds, `/health` 200, after the first scheduled window (or a manual `bun engine/cli.ts run …` via Coolify terminal) `jobs` shows runs and `select provider, count(*) from snapshots group by 1` is non-zero for each provider.
- [ ] **Step 5:** Start backfill via Coolify terminal: `run tmdb.universe --from 2023-11-01 --to 2026-11-16`, then `tmdb.details`, `wikidata.items`, `wiki.pageviews --from 2023-11-01 --to 2026-11-16`, `sacnilk.daily --from 2023-11-01 --to 2026-11-16` (runs for days at 5 s/page; fine).
- [ ] **Step 6:** Record app/db UUIDs in the deploy memory file and `docs/deploy-coolify.md`; tick phase 1 in `MILESTONE.md`; commit `docs: engine dev environment`.
