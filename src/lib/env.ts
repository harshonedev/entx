// Deployment config. Every value is a NEXT_PUBLIC_* build-time constant, so each Coolify app
// (entx.space, demo.entx.space, solana.entx.space) is built with its own values. Access must stay
// literal (`process.env.NEXT_PUBLIC_X`) or Next.js cannot inline it into the client bundle.

export type Mode = "demo" | "live";
export type Chain = "near" | "solana";

const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** demo = fully simulated (judges, video). live = real data + real testnet/devnet markets. */
export const MODE: Mode = pick(process.env.NEXT_PUBLIC_ENTX_MODE, ["demo", "live"] as const, "demo");
/** Primary chain of this deployment. NEAR is the default. */
export const CHAIN: Chain = pick(process.env.NEXT_PUBLIC_CHAIN, ["near", "solana"] as const, "near");

/**
 * Chains this deployment shows. Each host is single-chain: the NEAR sites never mention Solana and the
 * Solana site never offers NEAR wallets. Cross-chain views come back with the public chain switch (M4).
 */
export const CHAIN_ON: Record<Chain, boolean> = { near: CHAIN === "near", solana: CHAIN === "solana" };

/** True only when both chains are shown (cross-chain view, chain switch era). */
export const MULTICHAIN = CHAIN_ON.near && CHAIN_ON.solana;
/** Short names of the chains this deployment shows, e.g. "NEAR" or "NEAR · Solana". */
export const CHAIN_NAMES = (["near", "solana"] as const).filter((c) => CHAIN_ON[c]).map((c) => (c === "near" ? "NEAR" : "Solana"));

export const IS_DEMO = MODE === "demo";
export const IS_LIVE = MODE === "live";

/** Feature flags. Off unless explicitly "true". */
export const FLAGS = {
  /** Settings → chain switch. Hidden until after the hackathon. */
  chainSwitch: process.env.NEXT_PUBLIC_FLAG_CHAIN_SWITCH === "true",
} as const;

const url = (value: string | undefined, fallback: string) => (value && /^https?:\/\//.test(value) ? value.replace(/\/$/, "") : fallback);

/** Where each deployment lives. Used by the mode badge and the chain switch. */
export const HOSTS = {
  nearLive: url(process.env.NEXT_PUBLIC_URL_NEAR_LIVE, "https://entx.space"),
  nearDemo: url(process.env.NEXT_PUBLIC_URL_NEAR_DEMO, "https://demo.entx.space"),
  solana: url(process.env.NEXT_PUBLIC_URL_SOLANA, "https://solana.entx.space"),
} as const;

export const CHAIN_LABEL: Record<Chain, string> = { near: "NEAR testnet", solana: "Solana devnet" };

/** The deployment to send someone to for the other mode on this chain. */
export function otherModeUrl(mode: Mode = MODE, chain: Chain = CHAIN): string {
  // Solana has no live deployment until M3, so its live counterpart is the NEAR live site.
  if (chain === "solana") return mode === "demo" ? HOSTS.nearLive : HOSTS.solana;
  return mode === "demo" ? HOSTS.nearLive : HOSTS.nearDemo;
}

/** The deployment for a chain. */
export function chainUrl(chain: Chain): string {
  return chain === "solana" ? HOSTS.solana : HOSTS.nearLive;
}
