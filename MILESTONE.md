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

## M0 — Hackathon submission  `DONE`

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
- [x] Testnet wallet flow verified end-to-end and recorded (brag-output/testnet-walkthrough.mp4, 3:25): Meteor connect → buy → `record_trade` receipt → stake 0.1 Ⓝ on a live pool → on-chain page; resolve + claim on test market `walkthrough-settle-1794688742` (resolve CD3XJq39…, claim xqvUto58…)
- [x] X post tagging @NEARProtocol #NEARHackathon, launch video attached
- [x] Repo public, MIT license present

### Exit gate
- [x] Testing (536 tests, lint, tsc, live image smoke test + desktop/mobile screenshots)
- [x] Security audit (1 high, 9 medium found; 9 fixed in d39620f, 2 logged as accepted risks)
- [x] Deploy check (a400910 on entx.space, www., demo., solana.: all routes incl. dynamic asset/prediction pages 200, Coolify running:healthy, security headers present, HTTP→HTTPS redirect, OG image + icons served, oracle rejects unauthenticated cross-origin POST with 401; solana. returns 503 because it holds no oracle keys)

---

## M1 — EPI data engine  `P1`

Spec: `docs/superpowers/specs/2026-11-16-epi-data-engine-design.md`. Branch `feat/epi-data-engine`. Dev environment on Coolify (`dev`: Postgres `entx-dev-db`, `entx-data-engine`, later `entx-trust-engine`), built from the GitHub `dev` branch.

- [x] Phase 1: evidence collection — collectors (TMDB, Wikidata, Wikipedia, Netflix Top 10, Sacnilk), immutable snapshots, scheduler, worker (plan: `docs/superpowers/plans/2026-11-16-epi-engine-phase1-evidence.md`)
- [ ] Phase 2: canonical titles, resolver, canonical metrics, FX
- [ ] Phase 3: Trust Engine (tiers, freshness, agreement, independence, consensus states)
- [ ] Phase 4: three EPI models (theatrical, streaming film, series), versioned reports, read-only EPI API
- [ ] Phase 5: backtesting, tuned first methodology
- [ ] Phase 6: full switch of live mode (EPI, price anchor, odds, scheduled oracle from a separate live contract/oracle), provenance drawer
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
| NEAR attestation of EPI report hashes + evidence (spec phase 7). Blocked on the go-live licence list | P1 | After M1 |
| Go-live licence: Sacnilk (Indian box office, currently scraped for dev) | P0 | Before go-live |
| Go-live licence: TMDB commercial agreement (non-commercial terms, 6-month cache limit) | P0 | Before go-live |
| Go-live licence: IMDb Data on AWS Data Exchange (Box Office Mojo grosses; scraping Mojo is forbidden) | P0 | Before go-live |
| Engine storage growth: Sacnilk film pages are ~570 KB each, so a daily run (~80 pages) stores ~45 MB raw / ~5 MB gzipped, about 2 GB a year. Store only changed content (skip when the extracted box-office section is unchanged, or keep diffs) and set a retention policy for unchanged raw HTML. Measured in the 2026-11-16 smoke run | P1 | Before go-live |
| Demo host publishes simulated news to the same NEAR contract live reads, so live's oracle history mixes in demo events. Give live its own contract or oracle account | P1 | M1 phase 6 |
| Live asset trading still per-browser simulation ("preview") | P1 | M2 |
| Put entx.space behind Cloudflare too, then firewall 80/443 to Cloudflare ranges and use `TRUST_PROXY=cloudflare` (per-visitor limits for proxied traffic) | P2 | M5 |
| Coolify API token was pasted in chat: rotate it | P0 | After M0 deploy |
| ~~Switch hosts to `entx.space`~~ done 2026-11-14 (TRUST_PROXY back to `true`: origin IP is public now) | P1 | M0 |
| Redeploy the NEAR contract with the post-M0 security review fixes (trade size caps, trusted-only counters, failed-claim restore). State layout unchanged, so `near deploy` upgrades in place | P1 | After judging freeze (Nov 18) |
| Solana host `/onchain` page is NEAR-only content (registry, oracle, receipts); give it a Solana view or hide the nav link | P2 | M3 |

## Accepted risks

| Milestone | Risk | Why accepted |
|-----------|------|--------------|
| M0 | Demo host's public oracle path is guarded only by a same-origin check (fakeable by scripts). Demo and live share one NEAR contract, so anyone can shift a live title's on-chain EPI by up to ±15 within rate limits | Testnet only, bounded, rate-limited; demo video needs click-to-publish. Fixed in M1 (separate contract/oracle for live) |
| M0 | Staking stays open until the oracle calls `close_market`/`resolve` (or `closes_at_ms`). If a real-world outcome becomes known first, informed users can still back the winning side | Testnet only; operator closes markets promptly. Settlement process with evidence and dispute window in M5 |
| M0 | Trade receipts are self-reported: anyone can file `record_trade` on any market, so receipt counts and reported size are not settled volume | Labelled "self-reported" on /onchain; per-receipt size capped in the contract. Real volume comes from the server AMM in M2 |
| M0 | `bun audit`: `stream-json` (via `@solana/web3.js` → `jayson`) and `minimatch` (eslint, dev-only) advisories | `@solana/web3.js` loads only jayson's browser client, which never runs stream-json; minimatch only parses our own lint globs. `uuid` fixed via override |
| M0 | `report_epi` in the contract accepts any value ≤100 from an allow-listed oracle; the ±15 bound lives only in the API route | Oracle key is server-only FC key; rotation runbook in docs/deploy-coolify.md. Move bound into contract in M1 |

## Changelog

- 2026-11-16: M1 phase 1 done: data engine live on Coolify dev (`entx-data-engine`, GitHub `dev` branch), final review fixes applied (82 engine tests, 653 total). 3-year backfill started. Deferred minors logged in the plan ledger.
- 2026-11-16: M1 replaced by the EPI data engine (spec + phase 1 plan). User decisions: separate engine worker, Indian cinema core, three EPI models, Sacnilk scraped for dev with licence before go-live, Mojo skipped, full switch of live mode. Coolify `dev` environment + Postgres created. Go-live licence list added to backlog.
- 2026-11-15: Post-M0 security review. Fixed: oracle bearer check is constant-time, oracle 502s no longer echo RPC errors, contract caps receipt size, counts only trusted EPI reports, restores a claim whose transfer fails, uuid override. Logged 3 accepted risks. Contract redeploy waits for the judging freeze to end.
- 2026-11-14: Submitted to NEAR Hackathon 2026 (tracks: Unstoppable DeFi, Open Innovation). M0 done. Freeze main during judging (Nov 16–18); keep all hosts up until at least Nov 25.
- 2026-11-14: Wallet-flow test found two bugs: app toasted "Receipt recorded" when the wallet sent nothing (#13), and Meteor Web silently no-ops signing on a session stored by an older near-connect executor (now disconnects and asks to reconnect). Contract now shows 1 receipt, 0.1 Ⓝ staked.
- 2026-11-14: Deploys had failed since PR #4 (empty public/ broke Docker COPY; *.png ignore dropped icons/OG image). Fixed in #6; brand metadata (#5) and Solana metadataBase (#7) live. Deploy check re-run on entx.space hosts. Remaining: testnet wallet flow, X post, submit.
- 2026-11-14: Each host is now single-chain (`CHAIN_ON`): NEAR sites show no Solana wallet, toggle or copy; Solana site shows no NEAR wallet.
- 2026-11-14: entx.space, demo., solana., www. live with Let's Encrypt certs; badges link across. Launch video in brag-output/. Remaining: post video + X post.
- 2026-11-14: M0 deployed to Coolify (fallback hosts). Remaining: README, video, X post.
- 2026-11-14: M0 build + security audit done; waiting on DNS/Coolify deploy.
- 2026-11-14: File created. M0 active. M1–M5 set from the initial plan.
