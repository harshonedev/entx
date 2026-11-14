// Prints the register_markets payload for the NEAR contract from the app's seed data.
// Usage: node scripts/markets-json.ts > /tmp/markets.json
import { ASSETS, computeEpi } from "../src/lib/assets.ts";
import { PREDICTIONS } from "../src/lib/predictions.ts";

const markets = [
  ...ASSETS.map((a) => ({
    id: a.id,
    kind: "Asset",
    title: a.title,
    ticker: a.ticker,
    epi_x10: Math.round(computeEpi(a.epiParts) * 10),
  })),
  ...PREDICTIONS.map((p) => ({
    id: p.id,
    kind: "Prediction",
    title: p.question,
    ticker: p.assetId ? ASSETS.find((a) => a.id === p.assetId)!.ticker : "ENTX",
    epi_x10: 0,
  })),
];
console.log(JSON.stringify({ markets }));
