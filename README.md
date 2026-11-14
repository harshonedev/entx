# ENTX — Entertainment, now tradable

**A multichain entertainment exchange.** Movies and TV shows become tradable markets priced by popularity,
performance and sentiment. Popularity comes from one score, the **Entertainment Popularity Index (EPI)**. A
**NEAR** contract holds the market registry, a trusted EPI oracle, trade receipts and real-NEAR prediction pools.
**NEAR Intents** quotes show how users could fund from any chain. **Solana** devnet stores a second, linked receipt
for each trade.

> **Honesty note.** Spot prices, AMM trades, balances and titles are **simulated** off-chain, and the UI labels
> them that way. These parts are **real on-chain**: the NEAR contract and its state, oracle EPI reports,
> trade receipts, YES/NO staking with testnet NEAR plus settlement and claims, and the Solana memo receipts.
> NEAR Intents quotes are **live mainnet prices requested with `dry: true`**. No deposit address is created
> and no funds move, because Intents has no testnet.

Hackathon tracks: **Unstoppable DeFi** + **Open Innovation**.

---

## Live deployment

| Thing | Where |
| --- | --- |
| NEAR contract (testnet) | [`entx-exchange-52194.testnet`](https://testnet.nearblocks.io/address/entx-exchange-52194.testnet) |
| Contract source | [`contracts/near/src/lib.rs`](contracts/near/src/lib.rs) (Rust, near-sdk 5.30) |
| Solana receipts | SPL Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` on devnet |
| NEAR Intents | 1Click API `https://1click.chaindefuser.com/v0/quote` (dry-run) |

Check the contract state from any terminal (needs [near-cli-rs](https://near.cli.rs)):

```bash
near contract call-function as-read-only entx-exchange-52194.testnet get_stats json-args '{}' network-config testnet now
near contract call-function as-read-only entx-exchange-52194.testnet get_epi_reports json-args '{"market_id":"dune-drift"}' network-config testnet now
near contract call-function as-read-only entx-exchange-52194.testnet get_recent_receipts json-args '{"limit":10}' network-config testnet now
```

---

## Quick start (about 2 minutes, no keys needed)

Requires **Node ≥ 22** and **pnpm**.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

The app reads the shared testnet contract above with no configuration. Without an oracle key, EPI updates
stay off-chain. Everything else still works: wallets, receipts, staking, Intents quotes.

### Full reproduction: your own contract + trusted oracle (about 5 minutes)

Requires Rust plus the `wasm32-unknown-unknown` target, [`cargo-near`](https://github.com/near/cargo-near) and
[`near-cli-rs`](https://github.com/near/near-cli-rs):

```bash
rustup target add wasm32-unknown-unknown
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh

pnpm contract:test   # 5 unit tests: registry, receipts, oracle trust, parimutuel payout, permissions
pnpm near:deploy     # creates a faucet-funded testnet account, builds, deploys, registers 19 markets,
                     # and writes .env.local (contract id + oracle key)
pnpm dev
```

To resolve a prediction market on-chain (owner/oracle only), run `pnpm near:resolve drift-opening-250 true`.

---

## What to try (demo script)

1. **Connect wallets.** Use *Connect NEAR* for a testnet wallet (Meteor, Intear, MyNearWallet, or NEAR CLI via
   near-connect). *Select Wallet* is optional and connects Phantom, Solflare or Backpack on Solana devnet.
2. **Discover** → open **DRIFT** (*Dune Drift: Part Three*).
3. **Buy 10 units.** The AMM fills the simulated trade. The wallet then signs:
   - a Solana devnet memo receipt, then
   - a NEAR `record_trade` call whose `chain_ref` stores the Solana signature, so the two chains are linked.
4. **Entertainment oracle → "Box office beats forecast".** The EPI recalculates (84.3 → 90.6). The server-side
   **trusted oracle** signs `report_epi` on NEAR, and a toast plus the activity feed link to NearBlocks.
   Simulated traders then reprice the market, the chart rips and the linked prediction odds move.
5. **ENTX Analyst** shows a transparent rule-based signal. Every factor and weight is visible. It only
   recommends and never trades.
6. **Prediction market → On-chain pool.** Stake **0.1 testnet NEAR on YES**. After `near:resolve`, press
   **Claim** for a pro-rata parimutuel payout.
7. **On-chain** page (`/onchain`) shows live contract stats, on-chain vs app EPI, pools, every trader's receipts with
   Solana cross-links, and the **NEAR Intents** panel. Pick SOL, ETH or USDC on Solana, Ethereum, Base or
   Arbitrum to get a live quote into USDC on NEAR.
8. **Portfolio** shows P&L, holdings, open predictions, trade history with **Solana and NEAR receipt links**,
   and the leaderboard.

---

## Architecture

```
            ┌──────────────────────── Next.js 16 app ─────────────────────────┐
            │ Discover · Terminal · Predictions · EPI · Portfolio · On-chain   │
            │                                                                  │
            │  Market engine (client, simulated)                               │
            │   ├─ constant-product AMM per title (0.3% fee, live candles)     │
            │   ├─ EPI = .35 box office + .25 streaming + .25 social + .15 critics
            │   ├─ oracle event → ΔEPI × 2.6 = target move → bot traders       │
            │   └─ CPMM YES/NO markets linked to titles                        │
            │  ENTX Analyst (rule-based, explainable, advisory only)           │
            └───────┬───────────────────────┬───────────────────────┬──────────┘
                    │ near-connect          │ /api/oracle            │ /api/intents/quote
                    ▼                       ▼ (server signer)        ▼
   ┌──────────── NEAR testnet: entx contract ─────────┐      NEAR Intents 1Click
   │ register_markets   report_epi (trusted/untrusted) │      (mainnet, dry: true)
   │ record_trade (+ chain_ref)   stake / resolve / claim
   │ views: get_stats get_markets get_recent_receipts …│
   └───────────────────────────────────────────────────┘
                    ▲ chain_ref = "solana:devnet:<sig>"
   Solana devnet ── SPL Memo receipt (wallet-adapter) ──┘
```

### NEAR contract (`contracts/near`)

| Method | Who | What |
| --- | --- | --- |
| `new(owner_id)` | deployer | init; owner is the first trusted oracle |
| `register_markets(markets)` | owner | asset + prediction registry (id, kind, title, ticker, EPI) |
| `add_oracle(account_id)` | owner | allow-list another EPI reporter |
| `report_epi(market_id, epi_x10, note)` | anyone | stored with `trusted` flag; only oracles move canonical EPI |
| `record_trade(market_id, side, qty_micro, price_micro, chain_ref?)` | any trader | notarised receipt + market volume |
| `stake(market_id, outcome)` *payable* | any trader | parimutuel YES/NO pool, min 0.01 NEAR |
| `resolve(market_id, outcome)` | oracle | settle prediction market |
| `claim(market_id)` | stakers | payout = stake × total / winning pool (U256 math; refunds if nobody won) |

All state changes emit NEP-297 `EVENT_JSON` logs (`standard: "entx"`).

### Code map

```
contracts/near/src/lib.rs        NEAR contract + unit tests
src/lib/engine.ts                AMM, CPMM, candle generation
src/lib/assets.ts                seed titles, EPI formula, oracle events
src/store/market.ts              simulation tick, trades, oracle (+ publish to NEAR), settlement
src/lib/near.tsx                 near-connect provider, record_trade receipts
src/lib/near-config.ts           RPC view helper, contract types
src/lib/solana.ts                Solana memo receipts + devnet airdrop
src/lib/receipts.ts              Solana → NEAR linked receipt flow
src/lib/analyst.ts               explainable signal engine
src/app/api/oracle/route.ts      trusted oracle signer (report_epi)
src/app/api/intents/quote/route.ts  1Click dry-run proxy
scripts/near-deploy.sh           one-command testnet deploy
```

## Environment

See [`.env.example`](.env.example). All variables are optional.

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NEAR_CONTRACT` | contract to use (defaults to the shared testnet deployment) |
| `NEAR_ORACLE_ACCOUNT` / `NEAR_ORACLE_PRIVATE_KEY` | server-only trusted oracle signer (testnet) |
| `NEXT_PUBLIC_SOLANA_RPC`, `NEXT_PUBLIC_NEAR_RPC` | RPC overrides |
| `ONECLICK_JWT` | 1Click API key (lower fee tier; quotes work without it) |

## Built during the hackathon

Everything in this repository was built during the event: the web app, the market engine, the NEAR contract,
the oracle service, the Intents integration and the Solana receipts.

## Roadmap

- Replace simulated spot trading with on-chain AMM pools on NEAR, collateralised in USDC, with Intents deposits
  executed for real (`dry: false` → deposit address → `/v0/status`).
- Multi-source oracle quorum (box office, streaming charts, social APIs) with signed attestations.
- Let the analyst act as an agent under a limited function-call key and user-set risk limits.
- TMDB metadata for real titles.

## License

[MIT](LICENSE)
