# ENTX demo video: script and shot list

Target length **2:30–3:00**. Record at 1440×900 (or 1920×1080), browser zoom 100%, dark OS theme.
Record on **https://entx-demo.harshone.space** except shot 8.

## Before you record

- Fresh browser profile or clear site data, so the portfolio starts at $1,000.
- NEAR testnet wallet with ~2 testnet NEAR (faucet: https://near-faucet.io), already connected once so the popup is quick.
- Open a second tab on https://testnet.nearblocks.io/address/entx-market-1794654167.testnet to show the transaction.
- Close the Settings and Demo panels. Hide bookmarks bar.
- Pick the spotlight title shown on Discover (e.g. *Resident Evil*); use it throughout.

## Shots

| # | Time | Screen | Do | Say (voice-over) |
|---|------|--------|----|------------------|
| 1 | 0:00–0:15 | Discover | Slow scroll from hero to Markets table | "ENTX turns movies and shows into tradable markets. Every title is priced by one live score, the Entertainment Popularity Index, built from real TMDB data: box office, streaming demand, social buzz and ratings." |
| 2 | 0:15–0:30 | Discover → proof strip | Hover the "Live on NEAR testnet" strip, click **Verify on-chain** briefly, back | "Underneath is a NEAR contract on testnet: the market registry, a trusted EPI oracle, trade receipts and real prediction pools." |
| 3 | 0:30–0:55 | Asset page | Open the spotlight title. Point at price, EPI, chart, analyst card | "Each title has a price, its EPI, and an explainable analyst signal. Every factor and weight is visible; it recommends, it never trades." |
| 4 | 0:55–1:20 | Asset page → Demo controls | Click **Demo** → *News event* → "Box office beats forecast" | "Now the oracle. A news event raises the EPI. The server signs `report_epi` on NEAR with a key that can call nothing else, and the price reprices toward what the new EPI supports." Show the toast, click its NearBlocks link. |
| 5 | 1:20–1:40 | Asset page → trade panel | Buy 10 units, approve the NEAR wallet popup | "Trades fill on an AMM. With a wallet connected, each fill is notarised on NEAR with `record_trade`." Show the fill receipt. |
| 6 | 1:40–2:05 | Prediction market | Open the linked prediction. Stake **0.1 NEAR on YES** in the on-chain pool | "Prediction markets follow the title's EPI. This pool holds real testnet NEAR: stake, settle, then claim a pro-rata payout." |
| 7 | 2:05–2:25 | On-chain page | Scroll stats, receipts, then NEAR Intents panel: pick SOL → quote | "The on-chain page reads everything live from the contract, and NEAR Intents shows how users could fund from any chain into USDC on NEAR." |
| 8 | 2:25–2:45 | Click the **Demo · Go live** badge | Land on **entx.harshone.space** | "There are two environments. Demo is fully simulated for exploring. Live runs on real data and real on-chain pools, with no demo controls, open to the public on testnet." |
| 9 | 2:45–3:00 | Portfolio on demo | Show P&L and receipt links | "Built during the NEAR hackathon. Try it at entx-demo.harshone.space. Code on GitHub, MIT licensed." End card: URL + repo. |

## If something goes wrong

- Oracle toast says rate-limited: wait 60s (one publish per title per minute) or pick another news event.
- Wallet popup slow: cut the wait in editing.
- Prices look flat: let the page run 20–30s before recording; simulated traders need a few ticks.

## End card text

```
ENTX: entertainment, now tradable
Demo  entx-demo.harshone.space
Live  entx.harshone.space
github.com/harshonedev/entx
#NEARHackathon
```
