# ENTX Milestones

Living roadmap. One milestone active at a time. Update this file as work lands.

## Rules

1. **One active milestone.** Work only on items in the active milestone unless something is a P0 bug.
2. **Exit gate before moving on.** A milestone is done only when every gate box is ticked:
   - **Testing:** `bun run test` green, `bun run lint` clean, `tsc --noEmit` clean, contract tests (`bun run contract:test`) green if contracts changed, plus a manual browser pass of every changed route at desktop (1440) and mobile (390).
   - **Security audit:** review of all changes in the milestone (secrets, env exposure, auth, input validation, rate limits, on-chain permissions, dependency audit). Findings fixed or logged below as accepted risk with reason.
   - **Deploy check:** the milestone's target hosts serve the new build and smoke-test passes.
3. **New work goes into the backlog first**, gets a priority, then is slotted into a milestone:
   - **P0** blocks users or is a security issue: goes into the active milestone now.
   - **P1** core to the product's next step: next milestone.
   - **P2** valuable but not urgent: a later milestone.
   - **P3** nice to have: backlog until there is room.
4. Milestones can be reordered or split when priorities change. Record why in the changelog at the bottom.

## Environments

| Host | Chain | Mode | Purpose |
|------|-------|------|---------|
| `entx.space` | NEAR testnet | live | Public, real data, real on-chain markets (default chain) |
| `demo.entx.space` | NEAR testnet | demo | Fully simulated, for judges and the video |
| `solana.entx.space` | Solana devnet | demo until M3, then live | Solana users |

Until the `entx.space` registration clears review, the same apps serve fallback hosts behind Cloudflare: `entx.harshone.space` (live), `entx-demo.harshone.space` (demo), `entx-solana.harshone.space` (solana). After it clears, switch the `NEXT_PUBLIC_URL_*` build vars back to `entx.space` hosts and redeploy.

One Docker image, deployed per host on Coolify with different env:

- `ENTX_MODE=demo|live`
- `NEXT_PUBLIC_CHAIN=near|solana`
- `NEXT_PUBLIC_FLAG_CHAIN_SWITCH=false` (hidden until after the hackathon)

---

## M0 — Hackathon submission  `ACTIVE`

**Deadline:** 2026-11-14 23:59 UTC.

**Scope decision (assumed, confirm):** live mode tonight has real EPI (TMDB) and real on-chain NEAR prediction markets (`stake` / `resolve` / `claim`). Asset-unit trading has no shared backend yet, so in live mode it is labelled "preview" (still per-browser) until M2.

### Build
- [x] Mode config: `ENTX_MODE` + `NEXT_PUBLIC_CHAIN` read in one place (`src/lib/env.ts`), exposed to client safely
- [x] Live mode: hide demo controls and simulated bots/news; EPI from real TMDB numbers
- [~] Live mode: on-chain NEAR pool leads the prediction page; odds still simulated. Moved to M2 (needs the shared market)
- [x] Live mode: asset trading labelled "preview"
- [x] Demo / Live badge on every page, links to the other host
- [x] Settings menu in nav with chain switch, behind `NEXT_PUBLIC_FLAG_CHAIN_SWITCH` (switch = go to the other chain's host)
- [x] `solana.entx.space` build: Solana chain, demo mode, memo receipts
- [x] Dockerfile (Next.js `output: "standalone"`, bun) + `.dockerignore`
- [x] Coolify: 3 apps from the same repo/image, env per host, DNS A records, TLS
- [x] Oracle: server-only keys set only on hosts that need them; `ENTX_PUBLIC_ORACLE` off on live

### Submission
- [x] README: hosts, modes, how to run locally, how to reproduce
- [x] Launch video made (brag-output/brag.mp4, 20s); longer walkthrough optional (docs/demo-video-script.md)
- [ ] X post tagging @NEARProtocol #NEARHackathon
- [x] Repo public, MIT license present

### Exit gate
- [x] Testing (536 tests, lint, tsc, live image smoke test + desktop/mobile screenshots)
- [x] Security audit (1 high, 9 medium found; 9 fixed in d39620f, 2 logged as accepted risks)
- [x] Deploy check (a400910 on entx.space, www., demo., solana.: all routes incl. dynamic asset/prediction pages 200, Coolify running:healthy, security headers present, HTTP→HTTPS redirect, OG image + icons served, oracle rejects unauthenticated cross-origin POST with 401; solana. returns 503 because it holds no oracle keys)

---

## M1 — Real data pipeline  `P1`

- [ ] Postgres on Coolify; schema for titles, EPI snapshots, sources
- [ ] Scheduled job: TMDB popularity, ratings, revenue; box-office and trend sources
- [ ] EPI computed server-side from stored snapshots; history endpoint
- [ ] Oracle job publishes `report_epi` to NEAR on a schedule (no click-triggered publishing in live)
- [ ] Charts in live mode read real EPI history
- [ ] Exit gate: testing · security audit · deploy check

## M2 — Shared live market  `P1`

- [ ] Server-side AMM and pools (one market for everyone)
- [ ] Wallet sign-in (NEAR), session handling
- [ ] Test credits via faucet, rate limited per wallet
- [ ] Every trade recorded on NEAR via `record_trade`
- [ ] Server-built candles, portfolio, trade history
- [ ] Remove "preview" label; live asset trading on `entx.space`
- [ ] Live prediction odds come from the on-chain pool, not the simulation (moved from M0)
- [ ] Exit gate: testing · security audit · deploy check

## M3 — Solana live  `P2`

- [ ] Anchor program on devnet matching the NEAR contract: markets, stake, resolve, claim, oracle reports
- [ ] Program tests + audit of account constraints and signer checks
- [ ] Frontend wired to the program on `solana.entx.space`; switch it to live mode
- [ ] Exit gate: testing · security audit · deploy check

## M4 — Public chain switch  `P2`

- [ ] Turn on `NEXT_PUBLIC_FLAG_CHAIN_SWITCH`
- [ ] Settings polish; remember chain choice per visitor
- [ ] Exit gate: testing · security audit · deploy check

## M5 — Hardening  `P2`

- [ ] Rate limits on all API routes; abuse controls on faucet and oracle
- [ ] Monitoring, error tracking, uptime alerts
- [ ] Database backups and restore test
- [ ] Market settlement process (who resolves, evidence, dispute window)
- [ ] Exit gate: testing · security audit · deploy check

---

## Backlog

| Item | Priority | Notes |
|------|----------|-------|
| Demo host publishes simulated news to the same NEAR contract live reads, so live's oracle history mixes in demo events. Give live its own contract or oracle account | P1 | Fold into M1 |
| Live asset trading still per-browser simulation ("preview") | P1 | M2 |
| Put entx.space behind Cloudflare too, then firewall 80/443 to Cloudflare ranges and use `TRUST_PROXY=cloudflare` (per-visitor limits for proxied traffic) | P2 | M5 |
| Coolify API token was pasted in chat: rotate it | P0 | After M0 deploy |
| ~~Switch hosts to `entx.space`~~ done 2026-11-14 (TRUST_PROXY back to `true`: origin IP is public now) | P1 | M0 |
| Solana host `/onchain` page is NEAR-only content (registry, oracle, receipts); give it a Solana view or hide the nav link | P2 | M3 |

## Accepted risks

| Milestone | Risk | Why accepted |
|-----------|------|--------------|
| M0 | Demo host's public oracle path is guarded only by a same-origin check (fakeable by scripts). Demo and live share one NEAR contract, so anyone can shift a live title's on-chain EPI by up to ±15 within rate limits | Testnet only, bounded, rate-limited; demo video needs click-to-publish. Fixed in M1 (separate contract/oracle for live) |
| M0 | `report_epi` in the contract accepts any value ≤100 from an allow-listed oracle; the ±15 bound lives only in the API route | Oracle key is server-only FC key; rotation runbook in docs/deploy-coolify.md. Move bound into contract in M1 |

## Changelog

- 2026-11-14: Deploys had failed since PR #4 (empty public/ broke Docker COPY; *.png ignore dropped icons/OG image). Fixed in #6; brand metadata (#5) and Solana metadataBase (#7) live. Deploy check re-run on entx.space hosts. Remaining: testnet wallet flow, X post, submit.
- 2026-11-14: Each host is now single-chain (`CHAIN_ON`): NEAR sites show no Solana wallet, toggle or copy; Solana site shows no NEAR wallet.
- 2026-11-14: entx.space, demo., solana., www. live with Let's Encrypt certs; badges link across. Launch video in brag-output/. Remaining: post video + X post.
- 2026-11-14: M0 deployed to Coolify (fallback hosts). Remaining: README, video, X post.
- 2026-11-14: M0 build + security audit done; waiting on DNS/Coolify deploy.
- 2026-11-14: File created. M0 active. M1–M5 set from the initial plan.
