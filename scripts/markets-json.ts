// Prints the register_markets payload for the NEAR contract from the TMDB catalogue.
// Usage: node scripts/markets-json.ts > /tmp/markets.json
import { readFileSync } from "node:fs";
import { computeEpi, type EpiParts } from "../src/lib/epi.ts";

interface A { id: string; title: string; ticker: string; epiParts: EpiParts }
interface P { id: string; question: string; assetId?: string }
const catalog = JSON.parse(readFileSync(new URL("../src/data/catalog.json", import.meta.url), "utf8")) as {
  assets: A[];
  predictions: P[];
};

const markets = [
  ...catalog.assets.map((a) => ({
    id: a.id,
    kind: "Asset",
    title: a.title,
    ticker: a.ticker,
    epi_x10: Math.round(computeEpi(a.epiParts) * 10),
  })),
  ...catalog.predictions.map((p) => ({
    id: p.id,
    kind: "Prediction",
    title: p.question,
    ticker: catalog.assets.find((a) => a.id === p.assetId)?.ticker ?? "ENTX",
    epi_x10: 0,
  })),
];
console.log(JSON.stringify({ markets }));
