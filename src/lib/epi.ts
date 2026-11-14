// Entertainment Popularity Index: pure math, shared by the app and the TMDB seed script.

export interface EpiParts {
  boxOffice: number; // 0-100 (shows: audience size)
  streaming: number; // 0-100
  social: number; // 0-100
  critics: number; // 0-100
}

export const EPI_WEIGHTS: Record<keyof EpiParts, number> = {
  boxOffice: 0.35,
  streaming: 0.25,
  social: 0.25,
  critics: 0.15,
};

export const EPI_LABELS: Record<keyof EpiParts, string> = {
  boxOffice: "Box office / audience",
  streaming: "Streaming demand",
  social: "Social buzz",
  critics: "Audience rating",
};

export function computeEpi(p: EpiParts): number {
  const v =
    p.boxOffice * EPI_WEIGHTS.boxOffice +
    p.streaming * EPI_WEIGHTS.streaming +
    p.social * EPI_WEIGHTS.social +
    p.critics * EPI_WEIGHTS.critics;
  return Math.round(v * 10) / 10;
}
