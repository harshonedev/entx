# Deploying ENTX on Coolify

Three Coolify applications, all from this repo and the same `Dockerfile`. They differ only in build args and env.

## 1. DNS

At your registrar for `entx.space`, add A records pointing at the VPS IP:

| Name | Type | Value |
|------|------|-------|
| `@` | A | `<VPS IP>` |
| `demo` | A | `<VPS IP>` |
| `solana` | A | `<VPS IP>` |

(Or one wildcard `*` A record plus `@`.)

## 2. Create the apps

For each row: **New Resource → Public/Private Repository → this repo → Build Pack: Dockerfile**, port `3000`, set the domain (Coolify issues TLS via Let's Encrypt).

| App | Domain | `NEXT_PUBLIC_ENTX_MODE` | `NEXT_PUBLIC_CHAIN` |
|-----|--------|------------------------|---------------------|
| entx-live | `https://entx.space` | `live` | `near` |
| entx-demo | `https://demo.entx.space` | `demo` | `near` |
| entx-solana | `https://solana.entx.space` | `demo` | `solana` |

## 3. Environment variables

`NEXT_PUBLIC_*` values are baked in at build time: in Coolify tick **Build Variable** on each of them, and redeploy after changing one.

All three apps:

```
NEXT_PUBLIC_FLAG_CHAIN_SWITCH=false      # build variable; true after the hackathon (M4)
NEXT_PUBLIC_NEAR_CONTRACT=entx-market-1794654167.testnet   # build variable
TRUST_PROXY=true                         # runtime; last X-Forwarded-For hop (Traefik). Use "cloudflare" when proxied by Cloudflare
```

Per app, the mode and chain from the table above (build variables).

Server-only secrets (runtime, **not** build variables):

| Var | entx-live | entx-demo | entx-solana |
|-----|-----------|-----------|-------------|
| `NEAR_ORACLE_ACCOUNT` / `NEAR_ORACLE_PRIVATE_KEY` | set | set | unset |
| `ENTX_PUBLIC_ORACLE` | `false` | `true` | `false` |
| `ORACLE_API_SECRET` | long random value | optional | unset |
| `ONECLICK_JWT` | optional | optional | optional |

Live never lets the in-app buttons publish to the oracle (`ENTX_PUBLIC_ORACLE=false`); only a caller with `ORACLE_API_SECRET` can. The oracle key is a function-call key limited to `report_epi`: a leak cannot move funds, but it can set any title's on-chain EPI. If it leaks, delete the access key on the oracle account (`near account delete-keys`), create a new one with `scripts/near-deploy.sh`, and update the env.

**Known risk (M0, accepted until M1):** the demo host's public oracle path is guarded only by a same-origin check, which a scripted client can fake. Demo and live share one contract, so anyone can move a live title's on-chain EPI by up to ±15 within the rate limits. Testnet only. M1 gives live its own contract or oracle account.

Do not publish port 3000 directly on the VPS; only Traefik should reach the container, or `TRUST_PROXY=true` lets clients pick their rate-limit bucket.

## 4. Verify

```bash
for h in entx.space demo.entx.space solana.entx.space; do curl -sI https://$h | head -1; done
```

Then open each host: the badge in the top bar must read **Live** on `entx.space` and **Demo** on the other two, and the Settings menu must not show the chain switch.

## Local image test

```bash
docker build --build-arg NEXT_PUBLIC_ENTX_MODE=live -t entx:live .
docker run --rm -p 3100:3000 entx:live
```

## EPI data engine (dev environment)

The engine (`data-engine/`, spec `docs/superpowers/specs/2026-11-16-epi-data-engine-design.md`) runs as its own app in the
ENTX project's **dev** environment, next to a private Postgres 17 database (`entx-dev-db`). Production apps are not
involved.

App `entx-data-engine`:

- Source: public GitHub repo, branch **`dev`** (feature branches merge into `dev`; `dev` merges into `main` only at the milestone exit gate)
- Auto-deploy: its own GitHub push webhook (separate secret from the production apps), so pushes to `dev` redeploy it and never touch production
- Build pack: Dockerfile, file `Dockerfile.data-engine`
- No domain. Health check: `/health` on port `8080` (Alpine image, busybox `wget`)
- UUIDs: app `zudxnqxwzmtagx7c39lpz89d`, database `farak8puayc4krazopgcbbrd` (internal only)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Internal URL of `entx-dev-db` |
| `ENGINE_USER_AGENT` | `entx-data-engine/0.1 (https://entx.space)`. Must name a contact; Wikimedia rejects generic agents |
| `TMDB_TOKEN` | TMDB v4 read token (paste in Coolify, never in chat or git) |
| `SACNILK_ENABLED` | `true` for dev. Licence required before go-live |
| `ENGINE_HEALTH_PORT` | Optional, default `8080` |
| `VIEWER_DB_PASSWORD` | Optional. Creates/updates the read-only `viewer` role (letters, digits, `_ - . ~`) |

The worker migrates the database on start, marks runs left `running` by a dead container as `abandoned`, then runs
collectors on the schedule in `data-engine/jobs/schedule.ts` (UTC).

Manual runs and backfill: Coolify terminal on the container, or the disabled scheduled tasks `engine-jobs-status` and
`engine-bootstrap-collect` (Scheduled Tasks → Execute now):

```bash
bun data-engine/cli.ts jobs                                   # last run per job
bun data-engine/cli.ts run tmdb.details                       # one job now
bun data-engine/cli.ts run tmdb.universe --from 2023-11-01 --to 2026-11-16   # adds cohort titles
bun data-engine/cli.ts run wiki.pageviews --from 2023-11-01 --to 2026-11-16
```

A job already running (scheduled or manual) is skipped with status `skipped_locked`.

### Browsing the dev database (desktop app over SSH)

Postgres stays private. Connect a desktop client (TablePlus, Postico 2, DBeaver) with its built-in SSH tunnel:

| Field | Value |
|-------|-------|
| SSH host / user / key | the VPS (`137.23.39.153`), your SSH user and key |
| DB host | container IP: `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' farak8puayc4krazopgcbbrd` on the VPS (changes if the container is recreated) |
| Port / database | `5432` / `entx` |
| User / password | `viewer` / value of `VIEWER_DB_PASSWORD` on `entx-data-engine` in Coolify (read-only role, created by the engine on start) |

`snapshots.payload` is gzip; use `bun data-engine/cli.ts inspect` (Coolify terminal) to read payloads as text.

### Database viewer (dev, web)

`entx-db-viewer` (pgweb `sosedoff/pgweb:0.16.2`, app `fr9nlvhrrqowefv2brigrh9y`) at
`https://fr9nlvhrrqowefv2brigrh9y.harshone.space`. Basic auth user `entx`, password in Coolify →
`entx-db-viewer` → `PGWEB_AUTH_PASS` (old unprefixed `AUTH_USER`/`AUTH_PASS` keys are unused; delete them).
Connects as the read-only `viewer` role, so writes fail.

