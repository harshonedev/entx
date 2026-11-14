export const usd = (n: number, digits = 2) =>
  // Sign from the rounded value, so -0.003 prints "$0.00", not "-$0.00".
  `${Number(n.toFixed(digits)) < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

export const compact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const compactUsd = (n: number) => `$${compact(n)}`;

/**
 * Signed percent from a fraction. Anything that rounds to zero at the shown precision prints as an
 * unsigned zero ("0.0%"), never "-0.0%" or "+0.0%": a sign on a zero claims a direction that isn't there.
 */
export function pct(n: number, digits = 2) {
  const fixed = (n * 100).toFixed(digits);
  if (Number(fixed) === 0) return `${(0).toFixed(digits)}%`;
  return `${n > 0 ? "+" : ""}${fixed}%`;
}

/** Prediction share price in cents. One decimal everywhere so the same price never reads 63¢ in one place and 63.2¢ in another. */
export const cents = (p: number) => `${(p * 100).toFixed(1)}¢`;

export const num = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function metricText(m: { value: number; unit: "usd" | "views" | "pct" }) {
  if (m.unit === "usd") return compactUsd(m.value);
  if (m.unit === "views") return compact(m.value);
  return `${Math.round(m.value)}/100`;
}

export function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
