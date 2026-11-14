"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMarket, type Trade } from "@/store/market";
import { useNotarize } from "./solana";
import { useNear, useNearNotarize } from "./near";

/**
 * Writes the receipt of a simulated trade to every enabled + connected chain.
 * Solana first (Memo program), then NEAR (record_trade) carrying the Solana signature as `chain_ref`,
 * so one trade is verifiable on both chains and linked across them.
 */
export function useReceipts() {
  const solana = useNotarize();
  const near = useNearNotarize();
  const { connected: solConnected } = useWallet();
  const { accountId } = useNear();
  const chains = useMarket((s) => s.chains);

  const active = {
    solana: solConnected && chains.solana,
    near: !!accountId && chains.near,
  };

  const record = useCallback(
    async (trade: Trade) => {
      let sig: string | undefined;
      if (active.solana) sig = await solana(trade);
      if (active.near) await near(trade, sig ? `solana:devnet:${sig}` : undefined);
    },
    [active.solana, active.near, solana, near],
  );

  return { record, active, any: active.solana || active.near };
}
