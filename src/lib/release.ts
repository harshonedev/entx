import type { AssetSeed } from "./assets";

const DAY = 86_400_000;

export type ReleasePhase = "upcoming" | "opening" | "run";

export interface ReleaseInfo {
  /** Days since release; negative before release. */
  days: number;
  phase: ReleasePhase;
  /** Short, film-native label: "Opens in 4 days", "Opening week", "Week 18 in release". */
  label: string;
  date: string;
}

export function releaseInfo(a: AssetSeed, now = Date.now()): ReleaseInfo {
  const released = new Date(`${a.releaseDate}T00:00:00Z`).getTime();
  const days = Math.floor((now - released) / DAY);
  const date = new Date(released).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (days < 0) {
    const n = -days;
    return { days, phase: "upcoming", date, label: n === 1 ? "Opens tomorrow" : `Opens in ${n} days` };
  }
  if (days < 7) {
    return { days, phase: "opening", date, label: a.kind === "movie" ? "Opening week" : "Premiere week" };
  }
  const week = Math.floor(days / 7) + 1;
  if (a.kind === "show" && a.stats.seasons && a.stats.seasons > 1) {
    return { days, phase: "run", date, label: `Season ${a.stats.seasons} on air` };
  }
  return { days, phase: "run", date, label: a.kind === "movie" ? `Week ${week} in release` : `Week ${week} since premiere` };
}

/** Days until the next Sunday (UTC), when weekend box office is reported. */
function daysToSunday(now: number) {
  const d = new Date(now).getUTCDay();
  return d === 0 ? 7 : 7 - d;
}

/**
 * The next dated thing that should move this title's price: an opening, the weekend box-office report,
 * or the closest prediction deadline. Returns a short, film-native line for the price header.
 */
export function nextCatalyst(
  a: AssetSeed,
  questions: { question: string; closesInDays: number; assetId?: string }[],
  now = Date.now(),
): { label: string; days: number } {
  const r = releaseInfo(a, now);
  const candidates: { label: string; days: number }[] = [];
  if (r.phase === "upcoming") candidates.push({ label: a.kind === "movie" ? "Opening day" : "Premiere", days: -r.days });
  // Box office reports only exist once a film is in cinemas: never offer one for a film that hasn't opened.
  if (a.kind === "movie" && r.phase !== "upcoming" && (a.status === "In theaters" || r.phase !== "run")) {
    const n = daysToSunday(now);
    candidates.push({ label: r.phase === "opening" ? "Opening-weekend box office" : "Weekend box office report", days: n });
  }
  if (a.kind === "show" && a.status === "Airing") candidates.push({ label: "Weekly streaming charts", days: 7 - (r.days % 7 || 0) });
  for (const p of questions) if (p.assetId === a.id) candidates.push({ label: p.question, days: p.closesInDays });
  if (!candidates.length) return { label: "Weekly streaming charts", days: 7 - (Math.max(r.days, 0) % 7) };
  return candidates.sort((x, y) => x.days - y.days)[0];
}
