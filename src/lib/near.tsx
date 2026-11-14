"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import { NEAR_CONTRACT, NEAR_NETWORK, nearTxUrl } from "./near-config";

/** record_trade storage deposit (~0.008 NEAR used; the contract refunds the excess). */
const RECEIPT_DEPOSIT = "10000000000000000000000"; // 0.01 NEAR
import { useMarket, type Trade } from "@/store/market";

interface NearCtx {
  accountId: string | null;
  ready: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  call: (method: string, args: Record<string, unknown>, depositYocto?: string, gasTera?: number) => Promise<string>;
}

const Ctx = createContext<NearCtx>({
  accountId: null,
  ready: false,
  connect: async () => {},
  disconnect: async () => {},
  call: async () => {
    throw new Error("NEAR not ready");
  },
});

export function NearProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const c = new NearConnector({
        network: NEAR_NETWORK,
        features: { signAndSendTransaction: true, testnet: true },
        footerBranding: null,
        autoConnect: true,
      });
      connector.current = c;
      c.on("wallet:signIn", (t) => setAccountId(t.accounts[0]?.accountId ?? null));
      c.on("wallet:signOut", () => setAccountId(null));
      try {
        await c.whenManifestLoaded;
        const { accounts } = await c.getConnectedWallet();
        if (alive) setAccountId(accounts[0]?.accountId ?? null);
      } catch {
        /* not connected yet */
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const connect = useCallback(async () => {
    if (!connector.current) return;
    await connector.current.connect();
  }, []);

  const disconnect = useCallback(async () => {
    if (!connector.current) return;
    await connector.current.disconnect();
    setAccountId(null);
  }, []);

  const call = useCallback(
    async (method: string, args: Record<string, unknown>, depositYocto = "0", gasTera = 50) => {
      const c = connector.current;
      if (!c || !accountId) throw new Error("Connect a NEAR wallet first");
      const wallet = await c.wallet();
      const out = await wallet.signAndSendTransaction({
        receiverId: NEAR_CONTRACT,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: method,
              args,
              gas: (BigInt(gasTera) * BigInt(1_000_000_000_000)).toString(),
              deposit: depositYocto,
            },
          },
        ],
      });
      const status = out?.status as unknown;
      if (status && typeof status === "object" && "Failure" in (status as object)) {
        throw new Error(JSON.stringify((status as { Failure: unknown }).Failure).slice(0, 160));
      }
      const hash = out?.transaction?.hash ?? out?.transaction_outcome?.id;
      // Some wallet executors resolve without signing (e.g. their approval window never opened).
      // No hash means nothing reached the chain, so never report it as recorded.
      if (!hash) {
        // Seen with Meteor Web after its near-connect executor updated: the stored session no longer
        // matches, so signing silently no-ops. Disconnecting clears that storage; a fresh connect works.
        try {
          await c.disconnect();
        } catch {
          // Best effort: the error below still tells the user to reconnect.
        }
        setAccountId(null);
        throw new Error("Wallet session expired, nothing was sent. Reconnect your wallet and try again");
      }
      return hash;
    },
    [accountId],
  );

  return <Ctx.Provider value={{ accountId, ready, connect, disconnect, call }}>{children}</Ctx.Provider>;
}

export const useNear = () => useContext(Ctx);

/** Notarise a simulated trade on the ENTX NEAR contract (record_trade). */
export function useNearNotarize() {
  const { accountId, call } = useNear();
  const setNear = useMarket((s) => s.setTradeNear);
  const toast = useMarket((s) => s.toast);

  return useCallback(
    async (trade: Trade, chainRef?: string) => {
      if (!accountId) return;
      if (trade.kind === "PAYOUT") return;
      setNear(trade.id, { nearStatus: "pending" });
      try {
        const hash = await call("record_trade", {
          market_id: trade.refId,
          side: trade.kind,
          qty_micro: Math.max(1, Math.round(trade.qty * 1e6)),
          price_micro: Math.round(trade.price * 1e6),
          chain_ref: chainRef ?? null,
        }, RECEIPT_DEPOSIT);
        setNear(trade.id, { nearTx: hash, nearStatus: "confirmed" });
        toast({
          title: "Receipt recorded on NEAR testnet",
          body: `record_trade · ${hash.slice(0, 10)}…`,
          tone: "neutral",
          href: hash ? nearTxUrl(hash) : undefined,
        });
      } catch (e) {
        setNear(trade.id, { nearStatus: "failed" });
        toast({
          title: "NEAR receipt not recorded",
          body: `${(e instanceof Error ? e.message : String(e)).slice(0, 100)} — simulated trade still went through.`,
          tone: "down",
        });
      }
    },
    [accountId, call, setNear, toast],
  );
}
