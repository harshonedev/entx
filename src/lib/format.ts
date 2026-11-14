export const usd = (n: number, digits = 2) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

export const compact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const compactUsd = (n: number) => `$${compact(n)}`;

export const pct = (n: number, digits = 2) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;

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
