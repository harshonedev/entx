"use client";

import { useCallback } from "react";
import { Buffer } from "buffer";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useMarket, type Trade } from "@/store/market";
import { explorerTx } from "@/lib/format";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * Writes a signed receipt of a (simulated) trade to Solana devnet via the SPL Memo program.
 * The trade itself and its price are simulated off-chain — only the receipt is on-chain.
 */
export function useNotarize() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const setSig = useMarket((s) => s.setTradeSig);
  const toast = useMarket((s) => s.toast);

  return useCallback(
    async (trade: Trade): Promise<string | undefined> => {
      if (!publicKey) return;
      setSig(trade.id, { sigStatus: "pending" });
      try {
        const memo = JSON.stringify({
          app: "ENTX",
          v: 1,
          sim: true,
          id: trade.id,
          k: trade.kind,
          r: trade.refId,
          q: Number(trade.qty.toFixed(4)),
          px: Number(trade.price.toFixed(4)),
          t: Math.floor(trade.ts / 1000),
        });
        const tx = new Transaction().add(
          new TransactionInstruction({
            programId: MEMO_PROGRAM_ID,
            keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
            data: Buffer.from(memo, "utf8"),
          }),
        );
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();
        const sig = await sendTransaction(tx, connection, { minContextSlot });
        setSig(trade.id, { sig, sigStatus: "pending" });
        await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
        setSig(trade.id, { sig, sigStatus: "confirmed" });
        toast({
          title: "Receipt recorded on Solana devnet",
          body: `${trade.kind} ${trade.label.length > 24 ? "prediction" : trade.label} · ${sig.slice(0, 10)}…`,
          tone: "neutral",
          href: explorerTx(sig),
        });
        return sig;
      } catch (e) {
        setSig(trade.id, { sigStatus: "failed" });
        const msg = e instanceof Error ? e.message : String(e);
        const noFunds = /insufficient|no record of a prior credit|debit an account/i.test(msg);
        toast({
          title: noFunds ? "Need devnet SOL for the receipt" : "Receipt not recorded",
          body: noFunds
            ? "Use the Airdrop button (or faucet.solana.com). Your simulated trade still went through."
            : `${msg.slice(0, 90)} — simulated trade still went through.`,
          tone: "down",
        });
      }
    },
    [connection, publicKey, sendTransaction, setSig, toast],
  );
}

export function useAirdrop() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const toast = useMarket((s) => s.toast);
  return useCallback(async () => {
    if (!publicKey) return;
    try {
      const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
      toast({ title: "Airdrop requested", body: "1 devnet SOL incoming…", tone: "neutral" });
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      toast({ title: "Airdrop confirmed", body: "+1 SOL on devnet", tone: "up", href: explorerTx(sig) });
    } catch {
      toast({
        title: "Devnet faucet rate-limited",
        body: "Open faucet.solana.com and paste your wallet address.",
        tone: "down",
        href: "https://faucet.solana.com",
      });
    }
  }, [connection, publicKey, toast]);
}
