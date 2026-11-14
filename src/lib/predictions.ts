// Prediction markets generated from the real TMDB catalogue (scripts/seed-tmdb.ts).
import catalog from "@/data/catalog.json";

export type PredictionCategory = "Box office" | "Awards" | "Renewal" | "Popularity";

export interface PredictionSeed {
  id: string;
  question: string;
  category: PredictionCategory;
  assetId?: string;
  /** +1: positive data for the asset pushes YES up. -1: pushes YES down. */
  sensitivity: 1 | -1;
  yesProb: number;
  liquidity: number;
  volume: number;
  closesInDays: number;
  rules: string;
}

export const PREDICTIONS: PredictionSeed[] = catalog.predictions as PredictionSeed[];
