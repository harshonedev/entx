// ENTX catalogue: real movies and TV shows seeded from TMDB (see scripts/seed-tmdb.ts → src/data/catalog.json).
// Titles, posters, release info and the EPI inputs come from real TMDB metrics. Market prices and oracle
// *events* in the app are simulated.

import catalog from "@/data/catalog.json";
import { computeEpi, EPI_LABELS, EPI_WEIGHTS, type EpiParts } from "./epi";

export { computeEpi, EPI_LABELS, EPI_WEIGHTS, type EpiParts };

export type AssetKind = "movie" | "show";

export interface AssetSeed {
  id: string;
  ticker: string;
  title: string;
  kind: AssetKind;
  genre: string;
  studio: string;
  year: number;
  status: "In theaters" | "Streaming" | "Upcoming" | "Airing" | "Renewal pending";
  tagline: string;
  colors: [string, string];
  basePrice: number;
  epiParts: EpiParts;
  confidence: number; // data-source confidence 0-100
  listedDaysAgo: number;
  metric: { label: string; value: number; unit: "usd" | "views" | "pct" };
  volatility: number;
  // TMDB provenance
  posterUrl: string | null;
  tmdbId: number;
  tmdbUrl: string;
  releaseDate: string;
  overview: string;
  stats: {
    revenue?: number;
    budget?: number;
    voteAverage: number;
    voteCount: number;
    popularity: number;
    seasons?: number;
  };
}

export const CATALOG_META = {
  source: catalog.source,
  attribution: catalog.attribution,
  generatedAt: catalog.generatedAt,
};

export const ASSETS: AssetSeed[] = catalog.assets as AssetSeed[];

export const ASSET_BY_ID: Record<string, AssetSeed> = Object.fromEntries(
  ASSETS.map((a) => [a.id, a]),
);

// ---- Oracle events (simulated external data updates) ----

export interface OracleEvent {
  id: string;
  label: string;
  detail: (a: AssetSeed) => string;
  delta: Partial<EpiParts>;
  metricMult: number;
}

export const ORACLE_EVENTS: OracleEvent[] = [
  {
    id: "box-office-beat",
    label: "Box office beats forecast",
    detail: (a) =>
      a.kind === "movie"
        ? `${a.title} opening weekend beats tracking by 38%`
        : `${a.title} ratings beat projections by 38%`,
    delta: { boxOffice: 14, social: 6 },
    metricMult: 1.38,
  },
  {
    id: "viral-trailer",
    label: "Trailer goes viral",
    detail: (a) => `${a.title} trailer crosses 60M views in 24h`,
    delta: { social: 16, streaming: 4 },
    metricMult: 1.12,
  },
  {
    id: "streaming-top",
    label: "#1 on streaming charts",
    detail: (a) => `${a.title} hits #1 on global streaming top-10`,
    delta: { streaming: 15, social: 5 },
    metricMult: 1.2,
  },
  {
    id: "critics-pan",
    label: "Reviews disappoint",
    detail: (a) => `Audience reviews sour for ${a.title}: rating slides sharply`,
    delta: { critics: -22, social: -8, boxOffice: -6 },
    metricMult: 0.88,
  },
  {
    id: "box-office-miss",
    label: "Box office misses",
    detail: (a) =>
      a.kind === "movie"
        ? `${a.title} second weekend drops 64%`
        : `${a.title} viewership falls 30% week-over-week`,
    delta: { boxOffice: -16, streaming: -4 },
    metricMult: 0.7,
  },
];
