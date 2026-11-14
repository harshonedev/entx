// Entertainment Popularity Index: pure math, shared by the app and the TMDB seed script.

export interface EpiParts {
  boxOffice: number; // 0-100: worldwide revenue; unreleased films: budget; shows: TMDB vote count
  streaming: number; // 0-100: TMDB popularity, rank-normalised (not streaming viewership)
  social: number; // 0-100: TMDB vote count (audience activity, not audience size)
  critics: number; // 0-100: TMDB audience vote average x10 (not critics)
}

export const EPI_WEIGHTS: Record<keyof EpiParts, number> = {
  boxOffice: 0.35,
  streaming: 0.25,
  social: 0.25,
  critics: 0.15,
};

export const EPI_LABELS: Record<keyof EpiParts, string> = {
  // Display names say what is actually measured (TMDB proxies), not verified box office or viewership.
  boxOffice: "Box office proxy (revenue, budget or votes)",
  streaming: "TMDB popularity proxy",
  social: "Audience activity (TMDB votes)",
  critics: "Audience rating (TMDB)",
};

/** Short display names for tight spots (table headers, formula, event deltas). Same honesty rule as EPI_LABELS. */
export const EPI_SHORT_LABELS: Record<keyof EpiParts, string> = {
  boxOffice: "Box office",
  streaming: "Popularity",
  social: "Votes",
  critics: "Rating",
};

export function computeEpi(p: EpiParts): number {
  const v =
    p.boxOffice * EPI_WEIGHTS.boxOffice +
    p.streaming * EPI_WEIGHTS.streaming +
    p.social * EPI_WEIGHTS.social +
    p.critics * EPI_WEIGHTS.critics;
  return Math.round(v * 10) / 10;
}
