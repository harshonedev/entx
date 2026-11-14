// Seeds ENTX with real movies and TV shows from TMDB.
//
//   node scripts/seed-tmdb.ts            (reads TMDB_TOKEN or TMDB_API_KEY from env or .env.local)
//
// Writes src/data/catalog.json: assets (with EPI inputs derived from real TMDB metrics) and prediction
// markets generated from those titles. The committed catalog means judges don't need a TMDB key.
//
// EPI inputs (each 0-100, see README):
//   boxOffice  movies: log-scaled worldwide revenue; upcoming films: budget-based; shows: log-scaled vote count
//   streaming  TMDB popularity, rank-normalised within the catalog
//   social     log-scaled TMDB vote count (audience engagement)
//   critics    TMDB vote average x 10
//
// This product uses the TMDB API but is not endorsed or certified by TMDB.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { computeEpi, type EpiParts } from "../src/lib/epi.ts";

const MOVIES = 9;
const UPCOMING = 2;
const SHOWS = 6;

// ---------- env + http ----------

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}

const TOKEN = envVar("TMDB_TOKEN");
const KEY = envVar("TMDB_API_KEY");
if (!TOKEN && !KEY) {
  console.error("Set TMDB_TOKEN (v4 read token) or TMDB_API_KEY (v3 key) in env or .env.local");
  process.exit(1);
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!TOKEN && KEY) url.searchParams.set("api_key", KEY);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401) throw new Error("TMDB rejected the credentials (401)");
    } catch (e) {
      if (attempt === 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw new Error(`TMDB request failed: ${path}`);
}

// ---------- TMDB shapes (subset) ----------

interface ListItem {
  id: number;
  popularity: number;
  adult?: boolean;
  original_language?: string;
}
interface Named {
  name: string;
}
interface MovieDetail {
  id: number;
  title: string;
  tagline: string;
  overview: string;
  release_date: string;
  status: string;
  revenue: number;
  budget: number;
  popularity: number;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  genres: Named[];
  production_companies: Named[];
}
interface TvDetail {
  id: number;
  name: string;
  tagline: string;
  overview: string;
  first_air_date: string;
  last_air_date: string;
  status: string;
  in_production: boolean;
  number_of_seasons: number;
  popularity: number;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  genres: Named[];
  networks: Named[];
  next_episode_to_air: { air_date: string } | null;
}

// ---------- helpers ----------

const clamp = (x: number, a = 1, b = 99) => Math.max(a, Math.min(b, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const DAY = 86_400_000;
const now = Date.now();
const daysFrom = (d: string) => (d ? Math.round((now - Date.parse(d)) / DAY) : 9999);

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const usedTickers = new Set<string>();
function ticker(title: string): string {
  const words = title
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["THE", "A", "AN", "OF", "AND"].includes(w));
  let t: string;
  if (words.every((w) => /^\d+$/.test(w))) t = words.join("").slice(0, 6);
  else if (words.length >= 3) t = words.map((w) => w[0]).join("").slice(0, 5);
  else if (words[0] && words[0].length <= 5) t = words[0];
  else {
    const w = words[0] ?? "ENTX";
    t = (w[0] + w.slice(1).replace(/[AEIOU]/g, "")).slice(0, 5);
    if (t.length < 3) t = w.slice(0, 5);
  }
  let out = t;
  for (let i = 2; usedTickers.has(out); i++) out = `${t.slice(0, 4)}${i}`;
  usedTickers.add(out);
  return out;
}

const GENRE_COLORS: Record<string, [string, string]> = {
  "Science Fiction": ["#2563eb", "#050b1a"],
  "Sci-Fi & Fantasy": ["#2563eb", "#050b1a"],
  Action: ["#ea580c", "#170a03"],
  "Action & Adventure": ["#ea580c", "#170a03"],
  Adventure: ["#d97706", "#1c1206"],
  Animation: ["#65a30d", "#0b1203"],
  Comedy: ["#eab308", "#161203"],
  Crime: ["#64748b", "#08090c"],
  Drama: ["#7c3aed", "#0d0618"],
  Family: ["#0891b2", "#031418"],
  Fantasy: ["#9333ea", "#100518"],
  Horror: ["#dc2626", "#160404"],
  Mystery: ["#0d9488", "#031211"],
  Romance: ["#db2777", "#160716"],
  Thriller: ["#475569", "#07090c"],
  Documentary: ["#059669", "#03140e"],
  Music: ["#c026d3", "#140316"],
  War: ["#78716c", "#0c0a09"],
};
const colorsFor = (genre: string): [string, string] => GENRE_COLORS[genre] ?? ["#f5b544", "#141006"];

const firstSentence = (s: string) => {
  const t = (s || "").split(/(?<=[.!?])\s/)[0] ?? "";
  return t.length > 110 ? `${t.slice(0, 107)}…` : t;
};

/** 10M → 40, 100M → 60, 1B → 80, 2B → 86 */
const revenueScore = (usd: number) => clamp(20 * Math.log10(Math.max(usd, 1e5) / 1e6) + 40);
/** 100 → 40, 1k → 60, 10k → 80, 30k → 90 */
const votesScore = (n: number) => clamp(20 * Math.log10(Math.max(n, 10)));

// ---------- fetch ----------

async function fetchMovies() {
  const trending = await tmdb<{ results: ListItem[] }>("/trending/movie/week");
  const upcoming = await tmdb<{ results: ListItem[] }>("/movie/upcoming", { region: "US" });
  const pickTrending = trending.results.filter((m) => !m.adult).slice(0, MOVIES);
  const trendingIds = new Set(pickTrending.map((m) => m.id));
  const pickUpcoming = upcoming.results
    .filter((m) => !m.adult && !trendingIds.has(m.id))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, UPCOMING);
  const ids = [...pickTrending, ...pickUpcoming].map((m) => m.id);
  return Promise.all(ids.map((id) => tmdb<MovieDetail>(`/movie/${id}`)));
}

async function fetchShows() {
  const trending = await tmdb<{ results: ListItem[] }>("/trending/tv/week");
  const ids = trending.results.filter((t) => !t.adult).slice(0, SHOWS).map((t) => t.id);
  return Promise.all(ids.map((id) => tmdb<TvDetail>(`/tv/${id}`)));
}

// ---------- transform ----------

type Status = "In theaters" | "Streaming" | "Upcoming" | "Airing" | "Renewal pending";

interface Asset {
  id: string;
  ticker: string;
  title: string;
  kind: "movie" | "show";
  genre: string;
  studio: string;
  year: number;
  status: Status;
  tagline: string;
  colors: [string, string];
  basePrice: number;
  epiParts: EpiParts;
  confidence: number;
  listedDaysAgo: number;
  metric: { label: string; value: number; unit: "usd" | "views" | "pct" };
  volatility: number;
  posterUrl: string | null;
  tmdbId: number;
  tmdbUrl: string;
  releaseDate: string;
  overview: string;
  stats: { revenue?: number; budget?: number; voteAverage: number; voteCount: number; popularity: number; seasons?: number };
}

function priceFromEpi(epi: number) {
  // $2 at EPI 30 … ~$20 at EPI 95: convex so hits trade at a premium
  return Math.round((2 + 18 * Math.pow(Math.max(0, epi - 30) / 65, 1.6)) * 100) / 100;
}

function build(movies: MovieDetail[], shows: TvDetail[]): Asset[] {
  const pops = [...movies.map((m) => m.popularity), ...shows.map((s) => s.popularity)].sort((a, b) => a - b);
  const popScore = (p: number) => clamp(35 + 63 * (pops.indexOf(p) / Math.max(1, pops.length - 1)));

  const assets: Asset[] = [];
  for (const m of movies) {
    const age = daysFrom(m.release_date);
    const status: Status = age < 0 ? "Upcoming" : age <= 75 ? "In theaters" : "Streaming";
    const revenue = m.revenue || 0;
    const boxOffice = revenue > 0 ? revenueScore(revenue) : m.budget > 0 ? clamp(revenueScore(m.budget * 1.2) - 8) : 35;
    const parts: EpiParts = {
      boxOffice: round1(boxOffice),
      streaming: round1(popScore(m.popularity)),
      social: round1(votesScore(m.vote_count)),
      critics: round1(clamp((m.vote_average || 6) * 10)),
    };
    const epi = computeEpi(parts);
    const genre = m.genres[0]?.name ?? "Film";
    assets.push({
      id: slug(m.title),
      ticker: ticker(m.title),
      title: m.title,
      kind: "movie",
      genre: m.genres.slice(0, 2).map((g) => g.name).join(" · ") || "Film",
      studio: m.production_companies[0]?.name ?? "Independent",
      year: Number((m.release_date || "").slice(0, 4)) || new Date().getFullYear(),
      status,
      tagline: m.tagline || firstSentence(m.overview),
      colors: colorsFor(genre),
      basePrice: priceFromEpi(epi),
      epiParts: parts,
      confidence: Math.round(clamp(55 + 9 * Math.log10(Math.max(m.vote_count, 1)), 50, 97)),
      listedDaysAgo: Math.max(0, Math.min(age < 0 ? 1 : age, 120)),
      metric:
        revenue > 0
          ? { label: "Worldwide box office", value: revenue, unit: "usd" }
          : m.budget > 0
            ? { label: "Production budget", value: m.budget, unit: "usd" }
            : { label: "TMDB votes", value: m.vote_count, unit: "views" },
      volatility: status === "Upcoming" ? 0.018 : status === "In theaters" ? 0.012 : 0.009,
      posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
      tmdbId: m.id,
      tmdbUrl: `https://www.themoviedb.org/movie/${m.id}`,
      releaseDate: m.release_date,
      overview: m.overview,
      stats: {
        revenue: revenue || undefined,
        budget: m.budget || undefined,
        voteAverage: m.vote_average,
        voteCount: m.vote_count,
        popularity: m.popularity,
      },
    });
  }

  for (const s of shows) {
    const airing = s.in_production && (s.next_episode_to_air || daysFrom(s.last_air_date) < 45);
    const status: Status = airing
      ? "Airing"
      : s.status === "Returning Series"
        ? "Renewal pending"
        : "Streaming";
    const parts: EpiParts = {
      boxOffice: round1(clamp(votesScore(s.vote_count) + 6)),
      streaming: round1(popScore(s.popularity)),
      social: round1(votesScore(s.vote_count)),
      critics: round1(clamp((s.vote_average || 6) * 10)),
    };
    const epi = computeEpi(parts);
    const genre = s.genres[0]?.name ?? "Drama";
    assets.push({
      id: slug(s.name),
      ticker: ticker(s.name),
      title: s.name,
      kind: "show",
      genre: s.genres.slice(0, 2).map((g) => g.name).join(" · ") || "Series",
      studio: s.networks[0]?.name ?? "Streaming",
      year: Number((s.first_air_date || "").slice(0, 4)) || new Date().getFullYear(),
      status,
      tagline: s.tagline || firstSentence(s.overview),
      colors: colorsFor(genre),
      basePrice: priceFromEpi(epi),
      epiParts: parts,
      confidence: Math.round(clamp(52 + 9 * Math.log10(Math.max(s.vote_count, 1)), 50, 95)),
      listedDaysAgo: Math.max(0, Math.min(daysFrom(s.last_air_date), 120)),
      metric: { label: "Audience rating", value: Math.round(s.vote_average * 10), unit: "pct" },
      volatility: status === "Airing" ? 0.011 : 0.009,
      posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : null,
      tmdbId: s.id,
      tmdbUrl: `https://www.themoviedb.org/tv/${s.id}`,
      releaseDate: s.first_air_date,
      overview: s.overview,
      stats: {
        voteAverage: s.vote_average,
        voteCount: s.vote_count,
        popularity: s.popularity,
        seasons: s.number_of_seasons,
      },
    });
  }

  // de-duplicate ids
  const seen = new Set<string>();
  return assets.filter((a) => (a.id && !seen.has(a.id) ? (seen.add(a.id), true) : false));
}

// ---------- predictions ----------

interface Prediction {
  id: string;
  question: string;
  category: "Box office" | "Awards" | "Renewal" | "Popularity";
  assetId: string;
  sensitivity: 1 | -1;
  yesProb: number;
  liquidity: number;
  volume: number;
  closesInDays: number;
  rules: string;
}

const fmtUsd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(n % 1e9 ? 2 : 0)}B` : `$${Math.round(n / 1e6)}M`);

function predictions(assets: Asset[]): Prediction[] {
  const out: Prediction[] = [];
  const add = (p: Omit<Prediction, "id" | "liquidity" | "volume">) => {
    const id = slug(`${p.assetId}-${p.category}-${out.length}`).slice(0, 60);
    const h = [...id].reduce((t, c) => t + c.charCodeAt(0), 0);
    out.push({ ...p, id, yesProb: Math.round(p.yesProb * 100) / 100, liquidity: 8000 + (h % 12) * 1000, volume: 15_000 + (h % 40) * 4_500 });
  };
  const movies = assets.filter((a) => a.kind === "movie");
  const shows = assets.filter((a) => a.kind === "show");

  // 1. Box-office milestones for the two biggest earners still in theaters / recently released
  for (const m of movies
    .filter((m) => m.stats.revenue && m.status !== "Upcoming")
    .sort((a, b) => (b.stats.revenue ?? 0) - (a.stats.revenue ?? 0))
    .slice(0, 2)) {
    const rev = m.stats.revenue!;
    const step = rev >= 1e9 ? 250e6 : rev >= 300e6 ? 100e6 : 50e6;
    const target = Math.ceil((rev * 1.15) / step) * step;
    add({
      question: `Will ${m.title} reach ${fmtUsd(target)} worldwide?`,
      category: "Box office",
      assetId: m.id,
      sensitivity: 1,
      yesProb: clamp(0.62 - (target / rev - 1) * 1.2, 0.12, 0.8),
      closesInDays: m.status === "In theaters" ? 30 : 60,
      rules: `Resolves YES if TMDB-reported worldwide revenue reaches ${fmtUsd(target)} before close (currently ${fmtUsd(rev)}).`,
    });
  }

  // 2. Opening weekend for the hottest upcoming film
  const up = movies.filter((m) => m.status === "Upcoming").sort((a, b) => b.stats.popularity - a.stats.popularity)[0];
  if (up) {
    // No budget on TMDB for many tentpoles: fall back to a franchise-scale bar for highly anticipated titles.
    const target = up.stats.budget
      ? Math.max(25e6, Math.round((up.stats.budget * 0.4) / 5e6) * 5e6)
      : up.stats.popularity > 40
        ? 250e6
        : 75e6;
    add({
      question: `Will ${up.title} open above ${fmtUsd(target)} worldwide?`,
      category: "Box office",
      assetId: up.id,
      sensitivity: 1,
      yesProb: clamp(0.35 + up.epiParts.streaming / 250, 0.3, 0.7),
      closesInDays: Math.max(7, -daysFrom(up.releaseDate) + 4),
      rules: `Resolves YES if the reported global opening-weekend gross (release ${up.releaseDate}) exceeds ${fmtUsd(target)}.`,
    });
  }

  // 3. Awards: highest-rated widely-seen film
  // Prefer awards-type films (drama/history) among well-rated, widely seen releases.
  const eligible = movies.filter((m) => m.stats.voteCount > 150 && m.status !== "Upcoming");
  const prestige = eligible.filter((m) => /Drama|History|War/.test(m.genre));
  const best = (prestige.length ? prestige : eligible).sort((a, b) => b.stats.voteAverage - a.stats.voteAverage)[0];
  if (best) {
    add({
      question: `Will ${best.title} earn a Best Picture nomination?`,
      category: "Awards",
      assetId: best.id,
      sensitivity: 1,
      // Franchise/genre fare is a long shot for Best Picture even when well rated.
      yesProb: clamp((best.stats.voteAverage - 6.8) / 4, 0.06, prestige.length ? 0.4 : 0.12),
      closesInDays: 70,
      rules: "Resolves YES if the film is nominated for Best Picture at the next Academy Awards.",
    });
  }

  // 4. Renewal: returning shows
  for (const s of shows.filter((s) => s.status !== "Streaming").slice(0, 2)) {
    add({
      question: `Will ${s.title} be renewed for Season ${(s.stats.seasons ?? 1) + 1}?`,
      category: "Renewal",
      assetId: s.id,
      sensitivity: 1,
      yesProb: clamp(0.4 + (s.stats.voteAverage - 7) / 6, 0.25, 0.85),
      closesInDays: 45,
      rules: "Resolves YES on an official renewal announcement by the network/streamer before close.",
    });
  }

  // 5. Popularity: top trending show keeps #1
  const topShow = [...shows].sort((a, b) => b.stats.popularity - a.stats.popularity)[0];
  if (topShow) {
    add({
      question: `Will ${topShow.title} still be the #1 trending show on TMDB in 2 weeks?`,
      category: "Popularity",
      assetId: topShow.id,
      sensitivity: 1,
      yesProb: 0.45,
      closesInDays: 14,
      rules: "Resolves YES if it ranks #1 on TMDB's weekly TV trending list at close.",
    });
  }

  // 6. Popularity: an EPI milestone and a bearish drop market
  const climber = [...movies].filter((m) => computeEpi(m.epiParts) < 85).sort((a, b) => b.stats.popularity - a.stats.popularity)[0];
  if (climber) {
    const target = Math.min(95, Math.ceil(computeEpi(climber.epiParts) / 5) * 5 + 5);
    add({
      question: `Will ${climber.title} reach an EPI of ${target} this month?`,
      category: "Popularity",
      assetId: climber.id,
      sensitivity: 1,
      yesProb: 0.3,
      closesInDays: 21,
      rules: `Resolves YES if the ENTX Popularity Index for ${climber.ticker} prints ≥ ${target}.0 on-chain.`,
    });
  }
  const theatrical = movies.filter((m) => m.status === "In theaters").sort((a, b) => b.stats.popularity - a.stats.popularity)[1];
  if (theatrical) {
    add({
      question: `Will ${theatrical.title} drop more than 50% in its next weekend?`,
      category: "Box office",
      assetId: theatrical.id,
      sensitivity: -1,
      yesProb: 0.42,
      closesInDays: 6,
      rules: "Resolves YES if weekend-over-weekend domestic gross falls by more than 50%.",
    });
  }
  return out;
}

// ---------- main ----------

const [movies, shows] = await Promise.all([fetchMovies(), fetchShows()]);
const assets = build(movies, shows);
const preds = predictions(assets);
mkdirSync("src/data", { recursive: true });
writeFileSync(
  "src/data/catalog.json",
  JSON.stringify(
    {
      source: "TMDB",
      attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      generatedAt: new Date().toISOString(),
      assets,
      predictions: preds,
    },
    null,
    2,
  ) + "\n",
);
console.log(`✓ ${assets.length} assets (${movies.length} movies, ${shows.length} shows), ${preds.length} prediction markets`);
for (const a of assets) console.log(`  ${a.ticker.padEnd(6)} ${a.kind.padEnd(5)} EPI ${computeEpi(a.epiParts).toFixed(1).padStart(5)}  $${a.basePrice.toFixed(2).padStart(6)}  ${a.status.padEnd(15)} ${a.title}`);
for (const p of preds) console.log(`  [${p.category}] ${p.question}  (${Math.round(p.yesProb * 100)}%)`);
