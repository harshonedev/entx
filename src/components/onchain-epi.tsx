"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import {
  NEAR_CONTRACT,
  nearAccountUrl,
  nearTxUrl,
  nearView,
  type NearMarket,
  type NearStats,
} from "@/lib/near-config";
import { useMarket } from "@/store/market";
import { ASSETS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { RealBadge } from "./ui";

/** Every market id the app currently lists (spot titles + prediction markets). */
export const APP_MARKET_IDS: ReadonlySet<string> = new Set([...ASSETS.map((a) => a.id), ...PREDICTIONS.map((p) => p.id)]);

/**
 * The one way both the home proof strip and /onchain count markets, so they never disagree:
 * - `registered`: `get_stats().markets`, everything ever registered on the NEAR contract (append-only);
 * - `listed`: registered markets whose id the app lists today (from `get_markets`);
 * - `legacy`: registered by earlier catalogue deploys and no longer traded in the app.
 */
export function marketCounts(stats: Pick<NearStats, "markets">, markets: readonly NearMarket[]) {
  const listed = markets.filter((m) => m && typeof m === "object" && APP_MARKET_IDS.has(m.id)).length;
  return { registered: stats.markets, listed, legacy: Math.max(0, stats.markets - listed) };
}

/**
 * Oracle EPI · NEAR: the EPI the trusted oracle last published for this title, shown under the app's live EPI so
 * the two numbers are never compared on different pages. Links to this browser's last oracle tx when there is one.
 */
export function OnchainEpi({ assetId }: { assetId: string }) {
  const oracleTx = useMarket((s) => s.markets[assetId]?.oracleTx);
  const [epi, setEpi] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    nearView<NearMarket | null>("get_market", { market_id: assetId })
      .then((m) => live && m && setEpi(m.epi_x10 / 10))
      .catch(() => {});
    return () => {
      live = false;
    };
    // Re-read after this browser publishes a new report.
  }, [assetId, oracleTx]);

  if (epi === null) return null;
  return (
    <a
      href={oracleTx ? nearTxUrl(oracleTx) : nearAccountUrl(NEAR_CONTRACT)}
      target="_blank"
      rel="noreferrer"
      title="Last value the trusted oracle published to NEAR testnet: this title's TMDB baseline adjusted by the latest news event. It doesn't accumulate."
      className="cursor-pointer num mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-near hover:underline sm:min-h-6"
    >
      Oracle EPI · NEAR {epi.toFixed(1)} <ExternalLink size={10} aria-hidden />
    </a>
  );
}

/** One read of the contract's headline state: stats (counts), the trusted oracle list and the market registry. */
export function useContractFacts() {
  const [state, setState] = useState<{
    status: "loading" | "ok" | "error";
    stats?: NearStats;
    oracles?: string[];
    /** null when get_markets failed; counts that need it are then left out rather than guessed. */
    markets?: NearMarket[] | null;
  }>({ status: "loading" });
  useEffect(() => {
    let live = true;
    Promise.all([
      nearView<NearStats>("get_stats"),
      nearView<string[]>("get_oracles"),
      nearView<NearMarket[]>("get_markets", { from_index: 0, limit: 100 }).catch(() => null),
    ])
      .then(([stats, oracles, markets]) =>
        live && setState({ status: "ok", stats, oracles, markets: Array.isArray(markets) ? markets : null }),
      )
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/**
 * Home-page proof strip: the deployed contract and counts read live from NEAR testnet, so a visitor can
 * verify the chain side before touching the simulation. Nothing here is simulated or cached.
 */
export function ContractProofStrip() {
  const { status, stats, oracles, markets } = useContractFacts();
  const counts = stats && markets ? marketCounts(stats, markets) : null;
  // The contract owner is also allow-listed; the dedicated oracle account is the one that signs report_epi.
  const oracle = oracles?.find((o) => o !== stats?.owner) ?? oracles?.[0];

  return (
    <section
      aria-label="Live on NEAR testnet"
      className="panel flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3 text-[12.5px]"
    >
      <RealBadge>Live on NEAR testnet</RealBadge>
      <a
        href={nearAccountUrl(NEAR_CONTRACT)}
        target="_blank"
        rel="noreferrer"
        className="cursor-pointer num inline-flex min-w-0 items-center gap-1 break-all text-near hover:underline"
      >
        {NEAR_CONTRACT} <ExternalLink size={11} aria-hidden className="shrink-0" />
      </a>
      {status === "loading" && (
        <span role="status" className="text-muted">
          Reading contract…
        </span>
      )}
      {status === "error" && (
        <span role="status" className="text-muted">
          Couldn&apos;t reach the NEAR RPC, so live counts are unavailable. The contract link still works.
        </span>
      )}
      {status === "ok" && stats && (
        <>
          <span className="text-muted">
            <span className="num font-medium text-text">{stats.epi_reports}</span> oracle EPI reports
          </span>
          <span className="text-muted">
            <span className="num font-medium text-text">{stats.markets}</span> markets registered on NEAR
            {counts && (
              <>
                {" "}
                (<span className="num font-medium text-text">{counts.listed}</span> listed in app)
              </>
            )}
          </span>
          {oracle && (
            <a
              href={nearAccountUrl(oracle)}
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer inline-flex items-center gap-1 text-muted hover:text-near"
            >
              Trusted oracle <ExternalLink size={11} aria-hidden />
            </a>
          )}
        </>
      )}
      <span className="text-muted">
        + <span className="text-sol">Solana devnet</span> memo per trade
      </span>
      <Link
        href="/onchain"
        className="cursor-pointer inline-flex min-h-11 items-center gap-1 font-medium text-text hover:text-near sm:ml-auto sm:min-h-0"
      >
        Verify on-chain <ArrowRight size={13} aria-hidden />
      </Link>
    </section>
  );
}
