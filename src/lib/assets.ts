// Seed catalogue. All titles are fictional demo assets — no real studio IP.

export type AssetKind = "movie" | "show";

export interface EpiParts {
  boxOffice: number; // 0-100 (for shows: ratings / viewership)
  streaming: number; // 0-100
  social: number; // 0-100
  critics: number; // 0-100
}

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
}

export const EPI_WEIGHTS: Record<keyof EpiParts, number> = {
  boxOffice: 0.35,
  streaming: 0.25,
  social: 0.25,
  critics: 0.15,
};

export const EPI_LABELS: Record<keyof EpiParts, string> = {
  boxOffice: "Box office / ratings",
  streaming: "Streaming demand",
  social: "Social buzz",
  critics: "Critic score",
};

export function computeEpi(p: EpiParts): number {
  const v =
    p.boxOffice * EPI_WEIGHTS.boxOffice +
    p.streaming * EPI_WEIGHTS.streaming +
    p.social * EPI_WEIGHTS.social +
    p.critics * EPI_WEIGHTS.critics;
  return Math.round(v * 10) / 10;
}

export const ASSETS: AssetSeed[] = [
  {
    id: "dune-drift",
    ticker: "DRIFT",
    title: "Dune Drift: Part Three",
    kind: "movie",
    genre: "Sci-fi epic",
    studio: "Meridian Pictures",
    year: 2026,
    status: "Upcoming",
    tagline: "The desert remembers.",
    colors: ["#d97706", "#1c1206"],
    basePrice: 12.4,
    epiParts: { boxOffice: 78, streaming: 82, social: 93, critics: 88 },
    confidence: 86,
    listedDaysAgo: 2,
    metric: { label: "Pre-sale tickets", value: 41_200_000, unit: "usd" },
    volatility: 0.012,
  },
  {
    id: "neon-saints",
    ticker: "NEON",
    title: "Neon Saints",
    kind: "movie",
    genre: "Cyber-noir",
    studio: "Halcyon Studios",
    year: 2026,
    status: "In theaters",
    tagline: "Every city needs its sinners.",
    colors: ["#db2777", "#160716"],
    basePrice: 8.15,
    epiParts: { boxOffice: 71, streaming: 55, social: 84, critics: 74 },
    confidence: 92,
    listedDaysAgo: 19,
    metric: { label: "Global box office", value: 312_000_000, unit: "usd" },
    volatility: 0.01,
  },
  {
    id: "last-orbit",
    ticker: "ORBIT",
    title: "The Last Orbit",
    kind: "movie",
    genre: "Space thriller",
    studio: "Northlight Films",
    year: 2026,
    status: "In theaters",
    tagline: "No signal. No return.",
    colors: ["#2563eb", "#050b1a"],
    basePrice: 15.8,
    epiParts: { boxOffice: 90, streaming: 64, social: 80, critics: 91 },
    confidence: 95,
    listedDaysAgo: 34,
    metric: { label: "Global box office", value: 684_000_000, unit: "usd" },
    volatility: 0.008,
  },
  {
    id: "paper-tigers",
    ticker: "PTGR",
    title: "Paper Tigers",
    kind: "movie",
    genre: "Action comedy",
    studio: "Bluebell Pictures",
    year: 2026,
    status: "In theaters",
    tagline: "All roar. Some bite.",
    colors: ["#ea580c", "#170a03"],
    basePrice: 4.6,
    epiParts: { boxOffice: 58, streaming: 44, social: 62, critics: 49 },
    confidence: 88,
    listedDaysAgo: 11,
    metric: { label: "Global box office", value: 147_000_000, unit: "usd" },
    volatility: 0.015,
  },
  {
    id: "glass-garden",
    ticker: "GLASS",
    title: "The Glass Garden",
    kind: "movie",
    genre: "Prestige drama",
    studio: "Wren & Vale",
    year: 2026,
    status: "Streaming",
    tagline: "Some things grow only in the dark.",
    colors: ["#059669", "#03140e"],
    basePrice: 6.9,
    epiParts: { boxOffice: 42, streaming: 77, social: 58, critics: 97 },
    confidence: 81,
    listedDaysAgo: 46,
    metric: { label: "Awards buzz index", value: 92, unit: "pct" },
    volatility: 0.009,
  },
  {
    id: "monsoon",
    ticker: "MNSN",
    title: "Monsoon Kingdom",
    kind: "movie",
    genre: "Historical action",
    studio: "Saffron Lane",
    year: 2026,
    status: "Upcoming",
    tagline: "When the rains come, so do the kings.",
    colors: ["#0891b2", "#031418"],
    basePrice: 3.25,
    epiParts: { boxOffice: 52, streaming: 47, social: 71, critics: 60 },
    confidence: 72,
    listedDaysAgo: 1,
    metric: { label: "Trailer views (24h)", value: 38_000_000, unit: "views" },
    volatility: 0.02,
  },
  {
    id: "hollow-tide",
    ticker: "TIDE",
    title: "Hollow Tide",
    kind: "show",
    genre: "Supernatural mystery",
    studio: "Lantern TV",
    year: 2026,
    status: "Airing",
    tagline: "The sea gives back what it takes.",
    colors: ["#0d9488", "#031211"],
    basePrice: 9.7,
    epiParts: { boxOffice: 84, streaming: 91, social: 86, critics: 82 },
    confidence: 90,
    listedDaysAgo: 27,
    metric: { label: "Weekly hours viewed", value: 182_000_000, unit: "views" },
    volatility: 0.009,
  },
  {
    id: "crown-court",
    ticker: "CRWN",
    title: "Crown Court",
    kind: "show",
    genre: "Legal drama",
    studio: "Fairmont Network",
    year: 2025,
    status: "Renewal pending",
    tagline: "Justice is a performance.",
    colors: ["#7c3aed", "#0d0618"],
    basePrice: 5.4,
    epiParts: { boxOffice: 66, streaming: 72, social: 54, critics: 70 },
    confidence: 87,
    listedDaysAgo: 88,
    metric: { label: "Weekly hours viewed", value: 64_000_000, unit: "views" },
    volatility: 0.011,
  },
  {
    id: "byte-club",
    ticker: "BYTE",
    title: "Byte Club",
    kind: "show",
    genre: "Tech satire",
    studio: "Circuit Originals",
    year: 2026,
    status: "Airing",
    tagline: "Move fast. Break everyone.",
    colors: ["#65a30d", "#0b1203"],
    basePrice: 2.85,
    epiParts: { boxOffice: 48, streaming: 61, social: 79, critics: 76 },
    confidence: 79,
    listedDaysAgo: 6,
    metric: { label: "Weekly hours viewed", value: 21_000_000, unit: "views" },
    volatility: 0.018,
  },
  {
    id: "frostline",
    ticker: "FRST",
    title: "Frostline",
    kind: "show",
    genre: "Survival drama",
    studio: "Lantern TV",
    year: 2026,
    status: "Airing",
    tagline: "Winter keeps score.",
    colors: ["#0ea5e9", "#020d14"],
    basePrice: 7.2,
    epiParts: { boxOffice: 73, streaming: 80, social: 69, critics: 85 },
    confidence: 91,
    listedDaysAgo: 53,
    metric: { label: "Weekly hours viewed", value: 118_000_000, unit: "views" },
    volatility: 0.01,
  },
  {
    id: "velvet-hour",
    ticker: "VLVT",
    title: "The Velvet Hour",
    kind: "show",
    genre: "Period romance",
    studio: "Fairmont Network",
    year: 2026,
    status: "Streaming",
    tagline: "Midnight has rules.",
    colors: ["#be123c", "#16040a"],
    basePrice: 4.1,
    epiParts: { boxOffice: 55, streaming: 70, social: 66, critics: 61 },
    confidence: 84,
    listedDaysAgo: 3,
    metric: { label: "Weekly hours viewed", value: 47_000_000, unit: "views" },
    volatility: 0.013,
  },
  {
    id: "atlas-protocol",
    ticker: "ATLS",
    title: "Atlas Protocol",
    kind: "movie",
    genre: "Spy thriller",
    studio: "Northlight Films",
    year: 2026,
    status: "Streaming",
    tagline: "Trust is the first casualty.",
    colors: ["#64748b", "#08090c"],
    basePrice: 5.95,
    epiParts: { boxOffice: 61, streaming: 74, social: 57, critics: 66 },
    confidence: 89,
    listedDaysAgo: 71,
    metric: { label: "Global box office", value: 233_000_000, unit: "usd" },
    volatility: 0.009,
  },
];

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
    label: "Critics pan it",
    detail: (a) => `Reviews land for ${a.title}: critic score drops to 41%`,
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
