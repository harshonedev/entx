# EPI Data Engine — design

Date: 2026-11-16 · Status: draft for approval · Replaces the current M1 ("Real data pipeline") in `MILESTONE.md`

## 1. Intent

EPI today is a single weighted formula over four TMDB proxies, frozen at build time by `scripts/seed-tmdb.ts`.
It treats every title the same, scores shows with vote count twice, and scores streaming-only films as if they
were unreleased (budget fallback or a flat 35).

We want EPI to be built from **real signal from real sources**, with movies, streaming-only movies and shows
scored by **different models**, and **Indian cinema as a core market**. The lasting asset is not the formula; it
is the **evidence and trust layer**: for every number ENTX can say where it came from, when, which sources agree,
which were excluded and why, and how confident we are.

## 2. Goals, non-goals, anti-goals

**Goals**
- Collect raw evidence from multiple providers on a schedule and keep it auditable.
- One canonical title namespace across TMDB, IMDb, Wikidata, Wikipedia, Netflix and Sacnilk, including Indian
  regional titles and dubbed versions.
- Per-source, per-metric trust scoring: source tier, freshness, agreement between independent sources, integrity.
- Three EPI models (theatrical film, streaming-only film, show), each scoring only inputs above a confidence floor.
- Every EPI is a versioned, reproducible report with a status and a confidence, exposed to the app.

**Non-goals (this design)**
- Changing the NEAR contract or the oracle. Attestation is a later phase (§10).
- Server-side AMM / shared market (that is M2).
- Social-media signals (no licensed source yet).
- Changing demo mode. Demo keeps the current four-part simulated EPI and news events.

**Anti-goals (failure even if it "works")**
- Inventing a value: substituting a proxy for a missing metric, or averaging away a disagreement.
- Reporting `0` when the truth is "unknown". Unavailable EPI is `null` with status `insufficient_data`.
- Counting syndicated copies of one upstream feed as independent corroboration.
- A score nobody can reproduce: changed weights must not rewrite history.
- Writing unlicensed third-party data permanently onto a public chain.

## 3. Constraints

- **Judging freeze:** main auto-deploys to all three hosts. All work lives on `feat/epi-data-engine` (and
  follow-up branches); nothing merges to main before results on 2026-11-18.
- **Infra:** Coolify on the existing VPS. Postgres on Coolify (already planned for M1). No new vendors.
- **Runtime:** TypeScript. Bun is the package manager; the Next app runs on Node, so shared code must run on both.
- **Licensing (verified 2026-11-16):**

| Provider | What we use | Terms position | Decision |
|---|---|---|---|
| TMDB API | metadata, release types, ratings, votes, popularity, revenue | Non-commercial licence only; no caching > 6 months; attribution + logo required | Use now. Raw TMDB payloads expire after 6 months (§6). Commercial agreement on go-live list |
| Wikidata SPARQL | IDs (P345 IMDb, P4947 TMDB movie, P4983 TMDB TV), box office P2142, release info | CC0. Must send an informative User-Agent with contact; 60 s processing per 60 s per client | Use now |
| Wikimedia pageviews REST API | daily article views | Open. User-Agent with contact required or 403 | Use now |
| Wikipedia article infobox | gross figures (usually citing Sacnilk / Mojo / The Numbers) | CC BY-SA | Use now, lowest tier |
| Netflix Top 10 (Tudum) | weekly global views/hours/rank; weekly country lists incl. India | Public; exact downloadable files to be confirmed by builder | Use now |
| Sacnilk | Indian box office: day-wise India net/gross, overseas, worldwide, opening | Terms: reuse needs permission. robots.txt allows `/movie/`, `/news/`; blocks `/api/`, `/search` | **User decision: scrape now, request licence before go-live** |
| Box Office Mojo | international box office | Scraping explicitly forbidden (terms + robots `Disallow: /`) | **Not used.** Licensed path: IMDb Data on AWS Data Exchange, on go-live list |
| Ormax Media | Indian OTT viewership | Subscription only; no public per-title chart; reuse needs written permission | Not used in v1 |

**Go-live licence list** (blocking before public launch / on-chain attestation): Sacnilk licence, TMDB commercial
agreement, IMDb Data (Box Office Mojo) evaluation → contract.

## 4. Approaches considered

Where the engine runs:

- **A. Inside the Next app** (route handlers triggered by a Coolify scheduled task). One image, least setup; but
  ingestion, retries and scraping run in the web process and couple to UI code.
- **B. Separate worker in this repo** — **chosen by the user.** `engine/` runs as its own Coolify app, writes to
  shared Postgres; the Next app only reads finished reports. Isolates ingestion from the site, shares EPI types and
  math, one repo.
- **C. Separate repo/service.** Cleanest isolation, duplicates types/CI for no gain at this size. Rejected.

Storage for raw payloads: Postgres (compressed `bytea`) behind an `EvidenceStore` interface, swap to MinIO on
Coolify when volume demands. *(My call: payloads are small JSON/HTML; one store is simpler to back up and audit.
The suggested Supabase Storage was dropped: new vendor, and Postgres is already on Coolify.)*

## 5. Architecture

Five engines, one pipeline. Each stage reads the previous stage's tables and is idempotent.

```
Collectors ──► snapshots (immutable evidence)
                  │
Normalizer ──► titles + external_ids + observations (canonical metrics)
                  │
Trust Engine ─► observation confidence + metric_consensus (accepted / under_review / quarantined)
                  │
EPI Engine ───► epi_reports (versioned, reproducible)
                  │
App (live mode) reads epi_reports via a read-only API      Attestation (later phase) → NEAR
```

### 5.1 Repo layout *(my call)*

```
engine/
  collectors/   tmdb.ts wikidata.ts pageviews.ts wikipedia-infobox.ts netflix-top10.ts sacnilk.ts
  normalize/    resolver.ts metrics.ts currency.ts
  trust/        tiers.ts freshness.ts agreement.ts independence.ts confidence.ts
  epi/          models.ts theatrical.ts streaming.ts series.ts report.ts
  db/           migrations/*.sql  client.ts
  jobs/         scheduler.ts  (cron table, job locks)
  fixtures/     recorded payloads for tests
  main.ts       long-running worker entry
src/lib/epi/    shared types (EpiReport, metric names, statuses) used by engine and app
```

Engine logic (trust, scoring) is pure functions over plain data so it can be unit-tested with fixtures and rerun
for backtests. Deployed as a fourth Coolify app `entx-engine` from the same repo with its own Dockerfile
(`Dockerfile.engine`), long-running, with an in-process scheduler and a Postgres advisory lock per job so a
restarted or duplicated container never double-runs a job.

## 6. Collectors and evidence

Every fetch writes one immutable `snapshots` row:

```ts
interface SourceSnapshot {
  id: string;
  provider: string;            // "tmdb" | "wikidata" | "pageviews" | "wikipedia" | "netflix_top10" | "sacnilk"
  requestedUrl: string;
  sourceUrl: string;           // after redirects
  fetchedAt: string;
  observedAt: string | null;   // period the data describes, when the source states it
  httpStatus: number;
  contentType: string;
  payloadHash: string;         // sha256 of raw bytes
  payload: Uint8Array | null;  // gzip; null once expired by retention policy
  payloadExpiresAt: string | null;
  collectorVersion: string;
}
```

Rules:
- Never update or delete a snapshot row. Corrections create new snapshots and new observations.
- **Retention exception (TMDB):** until a TMDB commercial agreement exists, both the raw payload **and** the
  TMDB-derived observations expire after 6 months (payload nulled, observation rows deleted; snapshot row and
  `payloadHash` kept). Reports stay self-describing because each report stores its per-input scores, but reports
  older than 6 months can no longer be recomputed from TMDB inputs. *(My call: the terms arguably cover extracted
  values, so take the safe reading.)*
- **Purge (Sacnilk, or any provider that refuses permission):** delete that provider's payloads and observations,
  recompute every affected report as a new superseding sequence, and mark the old ones `withdrawn`.
  Reproducibility is explicitly waived for purged inputs. *(My call.)*
- Collectors are polite: identifying User-Agent with contact URL (configurable via env), per-provider rate limit,
  backoff on 429/5xx, conditional requests where supported, robots.txt honoured.
- **Sacnilk guardrails:** ≤ 1 request / 5 s, only paths robots.txt allows, no `/api/`, provider flag
  `SACNILK_ENABLED` to switch it off instantly, and every Sacnilk-derived value traceable so it can be purged if
  permission is refused.

Cadence *(my call, tune later)*:

| Collector | Cadence | Notes |
|---|---|---|
| TMDB details + release_dates | daily | title universe + metadata |
| Wikidata | weekly + on new title | ID mapping, P2142 |
| Pageviews | daily | 7-day and 28-day windows, per language wiki (en + hi/ta/te/ml/kn where an article exists) |
| Wikipedia infobox | weekly; daily for titles < 60 days old | parse gross + cited reference URL |
| Netflix Top 10 | weekly (Tuesday) | global + India lists |
| Sacnilk | daily for Indian titles in theatrical run | stop after run ends |

### Title universe *(my call)*

The engine tracks a `tracked_titles` list, not "all of TMDB": every title in `src/data/catalog.json`, plus Indian
titles from TMDB discover (`with_original_language` in hi, te, ta, ml, kn, bn, mr; recent and upcoming), plus any
title Sacnilk lists as current. Which tracked titles become **markets** is out of scope.

**Cohort universe and backfill** *(my call)*: percentiles need far more titles than the markets. A separate
`cohort_titles` set holds releases from the last 3 years (TMDB discover, international + Indian languages), and
collectors have a **backfill mode**: pageviews history (available back to 2015), the Netflix Top 10 archive (back
to 2021), Wikidata/TMDB revenue, and Sacnilk past-title pages at the same 1 req / 5 s limit (~17k pages/day, so a
few days of background crawl). Cohort titles feed reference sets only; they never get live reports.

**Match review** *(my call)*: `pending_matches` is worked through a CLI (`bun engine/cli.ts matches list|accept|
reject`), not an admin UI. No new auth surface.

## 7. Normalizer

- **Canonical ID** `entx_title_id` per work; `external_ids(title_id, provider, external_id)` unique per provider.
- **Resolution order:** TMDB ID (anchor) → Wikidata via P4947/P4983 → IMDb via P345 → Wikipedia article via
  Wikidata sitelinks → Netflix/Sacnilk by title match.
- **Fuzzy matches** (Netflix, Sacnilk): normalised title + year ± 1 + language. Below a match threshold, the
  mapping goes to a `pending_matches` review list; observations from an unconfirmed mapping are not used.
- **Indian specifics:** one work, several language releases (Hindi dub of a Telugu film) is **one title**; per-
  language box office is stored as separate observations with a `language` dimension and summed only when the
  source reports them as parts of a total. Sacnilk "India net" and "India gross" are different metrics, never
  converted into each other.
- **Canonical metrics** (each observation = title, metric, value, unit, currency, territory, period start/end,
  snapshot id):
  `worldwide_gross`, `india_net`, `india_gross`, `overseas_gross`, `opening_weekend_gross`, `daily_net`,
  `streaming_views_week`, `streaming_hours_week`, `top10_rank_week` (with list: global/IN, category),
  `weeks_in_top10`, `pageviews_7d`, `pageviews_28d`, `tmdb_popularity`, `tmdb_vote_count`, `tmdb_vote_avg`,
  `release_type` (theatrical/digital/tv per TMDB release_dates).
- **Currency:** store native currency and amount. USD conversion uses the FX rate of the period end date; FX rates
  are themselves stored observations. *(FX source left to builder; must be free and citable, e.g. ECB reference
  rates.)*
- A rank is never converted into views or hours.

## 8. Trust Engine

Trust answers "is this number correct?". It is separate from **relevance** (how much a metric should move EPI),
which lives in the model weights.

Per observation: `C = 100 × Q × F × A × I`

- **Q, source tier — per provider per metric** (initial policy, versioned):

| Provider · metric | Tier | Q |
|---|---|---|
| Netflix Top 10 · Netflix views/hours/rank | T1 | 0.98 |
| Wikimedia · pageviews | T1 | 0.98 |
| TMDB · its own popularity/votes/rating | T1 | 0.98 |
| Sacnilk · India net/gross, daily, overseas | T3 (own estimates, revised over time) | 0.78 |
| TMDB · revenue | T4 (community-edited) | 0.62 |
| Wikidata · P2142 box office | T5 | 0.40 |
| Wikipedia infobox · gross | T5 | 0.40 |

- **F, freshness:** `F = 2^(−age / halfLife)`, half-life per metric: daily box office 2 d, weekly streaming 10 d,
  pageviews 3 d, lifetime gross 30 d after run ends, ratings 30 d, metadata 365 d.
- **A, agreement:** compare only observations with the same metric, territory and period. With ≥ 3 independent
  sources, consensus = tier-weighted median; a source outside tolerance (default 7 %, per metric) is **flagged**
  and excluded, never averaged in. With exactly 2 independent sources that disagree beyond tolerance, there is
  no defensible consensus: the metric goes `under_review` and neither value is used (the model treats the input as
  missing). *(My call: picking the higher tier would hide exactly the disagreement this engine exists to show.)* When only one independent source exists, A is **unknown** (stored as null, treated as 0.85 in C)
  and disclosed; it is never assumed to be 1.
- **Independence:** `provider_dependencies` graph. Wikipedia infobox values whose citation URL points to Sacnilk or
  Mojo are marked as derived from that upstream and do not count as corroboration of it. Unknown upstream =
  treated as dependent on nothing, but labelled "unverified independence".
- **I, integrity:** 1.0 when the snapshot exists, hash matches, parse succeeded and the value passes sanity bounds
  (non-negative, monotonic lifetime totals, plausible day-on-day change); 0 otherwise.

Consensus status per (title, metric, period): `accepted` · `under_review` (one source materially disagrees; excluded
until resolved) · `quarantined` (no defensible consensus or integrity failure; unavailable to EPI).

## 9. EPI models

**Model selection** from TMDB release types: any theatrical release (types 2/3) → **Theatrical**; only digital
(type 4) / premiere on a streaming platform → **Streaming film**; `kind = show` → **Series**. A theatrical film
keeps the theatrical model; once it reaches streaming, streaming metrics join as an optional input.

**Scoring each input** *(my call)*: every metric is turned into a 0–100 score by **percentile within a peer
cohort**, not absolute dollars, so a ₹300 Cr Telugu hit is compared with Indian releases, not with Marvel.
Cohorts: model × primary market (India-origin vs international) × age bucket (box office compared at the same day
since release). Cohort reference sets are frozen per methodology version.

Initial weights *(proposal, to be tuned by backtesting in phase 5; each version frozen once published)*:

| Input | Theatrical | Streaming film | Series |
|---|---|---|---|
| Box office performance (India net for India-origin, worldwide otherwise; age-aligned) | 0.40 | — | — |
| Box office momentum (week-on-week hold vs cohort) | 0.15 | — | — |
| Streaming performance (Netflix views/hours, Top 10 rank global + India) | optional 0.10 | 0.40 | 0.35 |
| Attention (Wikipedia pageviews 7 d, all language wikis) | 0.20 | 0.25 | 0.25 |
| Audience rating (TMDB vote avg, min-vote floor) | 0.15 | 0.20 | 0.15 |
| Engagement (TMDB vote count growth) | 0.10 | 0.15 | 0.10 |
| Season momentum (new season/episodes recency, pageview spike) | — | — | 0.15 |

**Missing inputs:** `EPI = Σ(w·S) / Σ(w)` over valid inputs only. EPI confidence *(my call, versioned with
the methodology)*: `confidence = 100 × coverage × Σ(w·C_i/100)/Σ(w) × independence`, where `coverage = Σ(valid w)
/ Σ(all w)` and `independence = 1.0` when every critical input has ≥ 2 independent sources, else `0.9`. Each model names **critical** inputs (Theatrical: box office performance;
Streaming film and Series: streaming performance *or* attention).

**Status:**
- `verified`: coverage ≥ 0.75, critical input present, confidence ≥ 70.
- `provisional`: coverage ≥ 0.5 and at least one critical input.
- `insufficient_data`: otherwise; `score = null`.
- `under_review`: a critical input is `under_review`.

Most non-Netflix streaming titles will be `provisional` in v1. That is correct and is shown in the UI.

**Report:**

```ts
interface EpiReport {
  titleId: string;
  model: "theatrical" | "streaming_film" | "series";
  score: number | null;
  momentum: number | null;      // change vs previous report, same methodology
  confidence: number;           // 0-100
  status: "verified" | "provisional" | "insufficient_data" | "under_review";
  methodologyVersion: string;   // e.g. "epi-2026.11-v1"
  inputs: { input: string; score: number | null; weight: number; confidence: number; sources: string[]; status: string }[];
  snapshotHashes: string[];
  calculatedAt: string;
  sequence: number;
}
```

Reports are append-only. `methodology_versions` stores weights, tiers, half-lives, tolerances and cohort
definitions, so any past report can be recomputed from stored observations with its own version.

## 10. Delivery phases

| Phase | Build | Done when |
|---|---|---|
| 1 | Postgres schema + migrations, collector framework, snapshots, TMDB + Wikidata + pageviews + Netflix Top 10 + Sacnilk + Wikipedia infobox collectors | Scheduled runs produce immutable evidence for the catalogue + Indian title universe |
| 2 | Canonical titles, resolver, pending-match review, canonical metrics, FX | Every tracked title maps across providers; no unconfirmed mapping feeds observations |
| 3 | Trust Engine: tiers, freshness, agreement, independence, consensus states | Disagreement fixtures produce flagged/quarantined states, never averages |
| 4 | Three EPI models, reports, methodology versioning; read-only `GET /api/epi` and `/api/epi/[id]/history` in the Next app (live mode only) | Missing data never fabricated; reports reproducible from a version |
| 5 | Backtesting over collected history; tune weights → first published methodology | Tuned version frozen |
| 6 | **Full switch of live mode** (user decision 2026-11-16): EPI page, asset pages, charts, price anchor (`fairValue`), prediction odds and the oracle all use engine reports. Titles with `insufficient_data` show "no index yet", their price anchor freezes at the last value, and nothing is published for them. Oracle publishes on a schedule (no click-triggered publishing in live) from a **separate live oracle account and contract**, so demo events never touch live state. Provenance drawer ("where this number came from") | Live mode has one EPI everywhere; demo unchanged |
| 7 | NEAR attestation of report hashes + evidence — **blocked on the go-live licence list** | Separate milestone |

**Phase 6 vs licences:** the scheduled oracle in phase 6 publishes the score only (as today's `report_epi` does), on
testnet. Publishing report hashes and evidence (phase 7) waits for licences. *(My call; flag if score-only
publishing should also wait.)*

**Environments** (user decision 2026-11-16): a new Coolify **dev** environment in the ENTX project holds Postgres,
`entx-engine` (built from the feature branch) and, from phase 4, a live-mode preview app from the same branch.
Production hosts are untouched until the milestone merges.

Before phase 5 freezes the first tuned version, reports carry a pre-release methodology (`epi-0.x`), are served
only by the internal API, and make no reproducibility promise; nothing public shows them. *(My call.)*

Phase 1 can start before results (branch only). Each phase ends with tests; the milestone ends with the
existing exit gate: full testing, security audit, deploy check.

## 11. Testing

- Collectors: recorded fixture payloads; parsers tested offline. One opt-in live smoke test per provider.
- Trust and EPI: pure-function unit tests, including the anti-goals as tests (missing input → null not 0;
  outlier excluded not averaged; syndicated copy not counted; old report reproduces under its version).
- Resolver: fixture set of hard Indian cases (dubbed releases, transliterated titles, same title different year).
- Existing vitest suite stays green; demo mode untouched.

## 12. Security

- Engine DB role can write; Next app uses a separate read-only role.
- Secrets (TMDB token, DB URLs) only in Coolify env; nothing `NEXT_PUBLIC_`.
- Scraped HTML is parsed as data only; never rendered raw in the app.
- Public API is read-only, rate-limited like the existing routes.

## 13. Left to the builder

Postgres client library and migration runner; HTML parser for Sacnilk/Wikipedia; exact Netflix Top 10 file URLs
and columns; FX source; scheduler implementation details; exact table DDL and indexes; cohort percentile
implementation; UI of the provenance drawer (follows DESIGN.md).

## 14. Calls made in this doc (not yet confirmed by the user)

Confirmed by the user: engine as a separate worker (B); Indian cinema core; Sacnilk scraped now, licence before
go-live; Mojo skipped; full switch of live mode; dev environment on Coolify now.

1. Payloads in Postgres, not Supabase/object storage.
2. Demo mode keeps the current simulated four-part EPI; only live switches.
3. Peer-cohort percentiles (India-origin vs international) instead of absolute USD.
4. Initial weights and source tiers above.
5. Tracked-title universe = catalogue + Indian discover + Sacnilk current list.
6. Attestation (phase 7) waits for licences, because on-chain data is permanent.
7. TMDB payloads and TMDB-derived observations expire after 6 months.
8. Two disagreeing sources → `under_review`, neither used.
9. EPI confidence formula (§9).
10. 3-year cohort backfill; CLI match review; pre-release `epi-0.x` until tuned.
11. Purge = delete provider data, supersede affected reports.
12. Phase 6 oracle publishes score only on testnet before licences.
