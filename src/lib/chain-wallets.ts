"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useNear } from "@/lib/near";

export type ChainKey = "near" | "solana";

export type ChainWallet = {
  connected: boolean;
  /** False while the chain's connector is still loading; connect() is a no-op until then. */
  ready: boolean;
  connect: () => void;
  disconnect: () => void;
};

/**
 * The one place that knows how to connect and disconnect each chain's wallet, shared by the wallet menu and
 * the dateline's receipt controls so the two entry points cannot drift.
 */
export function useChainWallets(): Record<ChainKey, ChainWallet> {
  const near = useNear();
  const sol = useWallet();
  const modal = useWalletModal();
  return {
    near: {
      connected: !!near.accountId,
      ready: near.ready,
      // Closing the NEAR selector rejects connect(); that is a cancel, not an error worth surfacing.
      connect: () => {
        if (near.ready) near.connect().catch(() => {});
      },
      disconnect: () => {
        near.disconnect().catch(() => {});
      },
    },
    solana: {
      connected: sol.connected,
      ready: true,
      connect: () => modal.setVisible(true),
      disconnect: () => {
        sol.disconnect().catch(() => {});
      },
    },
  };
}
