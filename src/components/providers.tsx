"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { useMarket } from "@/store/market";
import { NearProvider } from "@/lib/near";
import { CHAIN_ON } from "@/lib/env";
import "@solana/wallet-adapter-react-ui/styles.css";

const TICK_MS = 1500;

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("devnet"),
    [],
  );
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    // Server + first client render use the deterministic seed; saved demo state loads after mount.
    Promise.resolve(useMarket.persist.rehydrate()).then(() => {
      if (cancelled) return;
      useMarket.getState().ensureHistory();
      id = setInterval(() => useMarket.getState().tick(), TICK_MS);
    });
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* Empty list: Wallet Standard auto-detects Phantom, Solflare, Backpack…
          Only the Solana host reconnects a remembered wallet; on NEAR hosts Phantom must stay disconnected. */}
      <WalletProvider wallets={[]} autoConnect={CHAIN_ON.solana}>
        <WalletModalProvider>
          <NearProvider>{children}</NearProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
