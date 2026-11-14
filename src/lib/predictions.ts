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

export const PREDICTIONS: PredictionSeed[] = [
  {
    id: "drift-opening-250",
    question: "Will Dune Drift: Part Three open above $250M worldwide?",
    category: "Box office",
    assetId: "dune-drift",
    sensitivity: 1,
    yesProb: 0.62,
    liquidity: 20000,
    volume: 184_300,
    closesInDays: 12,
    rules: "Resolves YES if reported global opening-weekend gross exceeds $250M.",
  },
  {
    id: "orbit-1b",
    question: "Will The Last Orbit cross $1B lifetime gross?",
    category: "Box office",
    assetId: "last-orbit",
    sensitivity: 1,
    yesProb: 0.41,
    liquidity: 18000,
    volume: 96_800,
    closesInDays: 60,
    rules: "Resolves YES if lifetime worldwide gross reaches $1,000,000,000.",
  },
  {
    id: "glass-best-picture",
    question: "Will The Glass Garden win Best Picture?",
    category: "Awards",
    assetId: "glass-garden",
    sensitivity: 1,
    yesProb: 0.34,
    liquidity: 15000,
    volume: 221_500,
    closesInDays: 104,
    rules: "Resolves YES if the film wins the top award at the season's main ceremony.",
  },
  {
    id: "crown-renewal",
    question: "Will Crown Court be renewed for Season 4?",
    category: "Renewal",
    assetId: "crown-court",
    sensitivity: 1,
    yesProb: 0.57,
    liquidity: 10000,
    volume: 48_200,
    closesInDays: 21,
    rules: "Resolves YES on an official network renewal announcement before close.",
  },
  {
    id: "tide-top1",
    question: "Will Hollow Tide stay #1 in streaming for 3 more weeks?",
    category: "Popularity",
    assetId: "hollow-tide",
    sensitivity: 1,
    yesProb: 0.48,
    liquidity: 12000,
    volume: 73_900,
    closesInDays: 21,
    rules: "Resolves YES if it holds the #1 global streaming slot for 3 consecutive weekly charts.",
  },
  {
    id: "neon-drop",
    question: "Will Neon Saints drop more than 55% in its next weekend?",
    category: "Box office",
    assetId: "neon-saints",
    sensitivity: -1,
    yesProb: 0.39,
    liquidity: 9000,
    volume: 31_400,
    closesInDays: 4,
    rules: "Resolves YES if weekend-over-weekend domestic gross falls by more than 55%.",
  },
  {
    id: "byte-epi-80",
    question: "Will Byte Club reach an EPI of 80 this month?",
    category: "Popularity",
    assetId: "byte-club",
    sensitivity: 1,
    yesProb: 0.22,
    liquidity: 8000,
    volume: 12_700,
    closesInDays: 16,
    rules: "Resolves YES if the ENTX Popularity Index for BYTE prints ≥ 80.0.",
  },
];
