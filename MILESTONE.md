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

One Docker image, deployed per host on Coolify with different env:

- `ENTX_MODE=demo|live`
- `NEXT_PUBLIC_CHAIN=near|solana`
- `NEXT_PUBLIC_FLAG_CHAIN_SWITCH=false` (hidden until after the hackathon)

---

## M0 — Hackathon submission  `ACTIVE`

**Deadline:** 2026-11-14 23:59 UTC.

**Scope decision (assumed, confirm):** live mode tonight has real EPI (TMDB) and real on-chain NEAR prediction markets (`stake` / `resolve` / `claim`). Asset-unit trading has no shared backend yet, so in live mode it is labelled "preview" (still per-browser) until M2.

### Build
- [ ] Mode config: `ENTX_MODE` + `NEXT_PUBLIC_CHAIN` read in one place (`src/lib/env.ts`), exposed to client safely
- [ ] Live mode: hide demo controls and simulated bots/news; EPI from real TMDB numbers
- [ ] Live mode: prediction markets read/write on-chain NEAR pools as source of truth
- [ ] Live mode: asset trading labelled "preview"
- [ ] Demo / Live badge on every page, links to the other host
- [ ] Settings menu in nav with chain switch, behind `NEXT_PUBLIC_FLAG_CHAIN_SWITCH` (switch = go to the other chain's host)
- [ ] `solana.entx.space` build: Solana chain, demo mode, memo receipts
- [ ] Dockerfile (Next.js `output: "standalone"`, bun) + `.dockerignore`
- [ ] Coolify: 3 apps from the same repo/image, env per host, DNS A records, TLS
- [ ] Oracle: server-only keys set only on hosts that need them; `ENTX_PUBLIC_ORACLE` off on live

### Submission
- [ ] README: hosts, modes, how to run locally, how to reproduce
- [ ] Demo video recorded on `demo.entx.space`
- [ ] X post tagging @NEARProtocol #NEARHackathon
- [ ] Repo public, MIT license present

### Exit gate
- [ ] Testing
- [ ] Security audit
- [ ] Deploy check (all 3 hosts)

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
| _empty_ | | |

## Accepted risks

| Milestone | Risk | Why accepted |
|-----------|------|--------------|
| _none yet_ | | |

## Changelog

- 2026-11-14: File created. M0 active. M1–M5 set from the initial plan.
