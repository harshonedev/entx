# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Crypto-curious traders** who follow movies and TV and want to take a position on a title's popularity, box office, awards or renewal, without reading a whitepaper first.
- **Hackathon judges** (NEAR Hackathon 2026, Unstoppable DeFi + Open Innovation tracks) evaluating whether the NEAR and Solana integrations are real and working. They skim fast and verify on-chain links.

## Product Purpose

ENTX makes entertainment tradable. Movies and shows become markets priced by popularity, performance and sentiment, summarised in one score: the Entertainment Popularity Index (EPI). Users buy and sell title units, and bet YES/NO on prediction markets (box office targets, awards, renewals, popularity milestones). Success: a visitor understands what a title is worth and why within seconds, places a trade or bet, and can see which parts touched a real chain.

## Positioning

One index (EPI) built from real TMDB inputs drives both spot prices and prediction-market odds, with a NEAR contract holding the market registry, a trusted EPI oracle, trade receipts and real-NEAR prediction pools, and a linked Solana devnet receipt per trade.

## Capabilities and Constraints

- Real: titles, posters, release info and EPI inputs (seeded from TMDB); NEAR testnet contract state, oracle EPI reports, trade receipts, YES/NO staking with testnet NEAR plus settlement and claims; Solana devnet memo receipts; NEAR Intents quotes (live mainnet, `dry: true`).
- Simulated, off-chain: spot prices, AMM trades, balances, oracle events, prediction odds movement. The UI must label these as simulated.
- Prediction shares cost their price in cents and pay $1 if right; the price is the market's implied probability.
- Stack: Next.js App Router, Tailwind, zustand store persisted in localStorage, lightweight-charts.

## Evidence on Hand

- TMDB-seeded catalogue: `src/data/catalog.json` (titles, predictions).
- Deployed NEAR contract and oracle accounts listed in `README.md`.
- No testimonials, users or traction numbers exist; never invent them.

## Product Principles

1. Honesty over polish: every number says whether it is simulated or on-chain.
2. Show the mechanism: why a price or probability moved (EPI, oracle news) sits next to the number.
3. One tap to act: the trade or bet ticket is always reachable from the thing it trades.
4. Judges verify: on-chain actions link to explorers.
