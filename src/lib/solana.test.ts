import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Keypair, Transaction } from "@solana/web3.js";
import { useMarket, type Trade } from "@/store/market";

const pk = Keypair.generate().publicKey;
const connection = {
  getLatestBlockhashAndContext: vi.fn(),
  getLatestBlockhash: vi.fn(),
  confirmTransaction: vi.fn(),
  requestAirdrop: vi.fn(),
};
const wallet = { publicKey: pk as typeof pk | null, sendTransaction: vi.fn() };
vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: () => ({ connection }),
  useWallet: () => wallet,
}));

import { MEMO_PROGRAM_ID, useAirdrop, useNotarize } from "./solana";

const trade: Trade = { id: "t1", ts: 1_700_000_123_456, kind: "SELL", refId: "a", label: "TICK", qty: 1.234567, price: 9.87654, total: 12 };
const S = () => useMarket.getState();

beforeEach(() => {
  vi.useFakeTimers();
  wallet.publicKey = pk;
  wallet.sendTransaction.mockReset().mockResolvedValue("SIGNATURE123456");
  connection.getLatestBlockhashAndContext.mockReset().mockResolvedValue({
    context: { slot: 42 },
    value: { blockhash: "BH", lastValidBlockHeight: 100 },
  });
  connection.confirmTransaction.mockReset().mockResolvedValue({});
  connection.requestAirdrop.mockReset().mockResolvedValue("AIRDROPSIG");
  connection.getLatestBlockhash.mockReset().mockResolvedValue({ blockhash: "BH2", lastValidBlockHeight: 7 });
  useMarket.setState({ toasts: [], trades: [trade] });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useNotarize", () => {
  it("sends a memo tx with the trade receipt and confirms it", async () => {
    const { result } = renderHook(() => useNotarize());
    let sig: string | undefined;
    await act(async () => {
      sig = await result.current(trade);
    });
    expect(sig).toBe("SIGNATURE123456");
    const [tx, conn, opts] = wallet.sendTransaction.mock.calls[0];
    expect(conn).toBe(connection);
    expect(opts).toEqual({ minContextSlot: 42 });
    const ix = (tx as Transaction).instructions[0];
    expect(ix.programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(ix.keys[0]).toMatchObject({ isSigner: true, isWritable: false });
    expect(JSON.parse(ix.data.toString("utf8"))).toEqual({
      app: "ENTX", v: 1, sim: true, id: "t1", k: "SELL", r: "a", q: 1.2346, px: 9.8765, t: 1_700_000_123,
    });
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      { blockhash: "BH", lastValidBlockHeight: 100, signature: "SIGNATURE123456" },
      "confirmed",
    );
    expect(S().trades[0]).toMatchObject({ sig: "SIGNATURE123456", sigStatus: "confirmed" });
    expect(S().toasts.at(-1)).toMatchObject({
      title: "Receipt recorded on Solana devnet",
      href: "https://explorer.solana.com/tx/SIGNATURE123456?cluster=devnet",
    });
  });

  it("long labels (predictions) are summarised in the toast", async () => {
    const { result } = renderHook(() => useNotarize());
    await act(() => result.current({ ...trade, kind: "YES", label: "Will this very long question resolve yes?" }));
    expect(S().toasts.at(-1)!.body).toMatch(/^YES prediction/);
  });

  it("no-op without wallet", async () => {
    wallet.publicKey = null;
    const { result } = renderHook(() => useNotarize());
    expect(await result.current(trade)).toBeUndefined();
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("insufficient funds → airdrop hint", async () => {
    wallet.sendTransaction.mockRejectedValue(new Error("Attempt to debit an account but found no record of a prior credit."));
    const { result } = renderHook(() => useNotarize());
    await act(() => result.current(trade));
    expect(S().trades[0].sigStatus).toBe("failed");
    expect(S().toasts.at(-1)!.title).toBe("Need devnet SOL for the receipt");
  });

  it("other errors → generic failure toast", async () => {
    wallet.sendTransaction.mockRejectedValue(new Error("User rejected the request"));
    const { result } = renderHook(() => useNotarize());
    await act(() => result.current(trade));
    expect(S().toasts.at(-1)).toMatchObject({ title: "Receipt not recorded", tone: "down" });
    expect(S().toasts.at(-1)!.body).toMatch(/User rejected/);
  });
});

describe("useAirdrop", () => {
  it("requests 1 SOL and confirms", async () => {
    const { result } = renderHook(() => useAirdrop());
    await act(() => result.current());
    expect(connection.requestAirdrop).toHaveBeenCalledWith(pk, 1_000_000_000);
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      { signature: "AIRDROPSIG", blockhash: "BH2", lastValidBlockHeight: 7 },
      "confirmed",
    );
    expect(S().toasts.map((t) => t.title)).toEqual(["Airdrop requested", "Airdrop confirmed"]);
  });

  it("faucet failure points to faucet.solana.com", async () => {
    connection.requestAirdrop.mockRejectedValue(new Error("429"));
    const { result } = renderHook(() => useAirdrop());
    await act(() => result.current());
    expect(S().toasts.at(-1)).toMatchObject({ title: "Devnet faucet rate-limited", href: "https://faucet.solana.com" });
  });

  it("no-op without wallet", async () => {
    wallet.publicKey = null;
    const { result } = renderHook(() => useAirdrop());
    await act(() => result.current());
    expect(connection.requestAirdrop).not.toHaveBeenCalled();
  });
});
