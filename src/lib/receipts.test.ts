import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMarket, type Trade } from "@/store/market";

const solana = vi.fn();
const near = vi.fn();
const state = { solConnected: true, accountId: "a.testnet" as string | null };
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => ({ connected: state.solConnected }) }));
vi.mock("./solana", () => ({ useNotarize: () => solana }));
vi.mock("./near", () => ({ useNearNotarize: () => near, useNear: () => ({ accountId: state.accountId }) }));

import { useReceipts } from "./receipts";
// These tests cover the cross-chain view (both wallets), as with the chain switch on.
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), CHAIN_ON: { near: true, solana: true }, MULTICHAIN: true, CHAIN_NAMES: ["NEAR", "Solana"] }));


const trade = { id: "t" } as Trade;

beforeEach(() => {
  solana.mockReset().mockResolvedValue("SOLSIG");
  near.mockReset().mockResolvedValue(undefined);
  state.solConnected = true;
  state.accountId = "a.testnet";
  useMarket.setState({ chains: { solana: true, near: true } });
});

describe("useReceipts", () => {
  it("records on Solana then NEAR, linking the Solana signature", async () => {
    const { result } = renderHook(() => useReceipts());
    expect(result.current.active).toEqual({ solana: true, near: true });
    expect(result.current.any).toBe(true);
    await act(() => result.current.record(trade));
    expect(solana).toHaveBeenCalledWith(trade);
    expect(near).toHaveBeenCalledWith(trade, "solana:devnet:SOLSIG");
    expect(solana.mock.invocationCallOrder[0]).toBeLessThan(near.mock.invocationCallOrder[0]);
  });

  it("NEAR only when Solana disabled → no chain_ref", async () => {
    useMarket.setState({ chains: { solana: false, near: true } });
    const { result } = renderHook(() => useReceipts());
    await act(() => result.current.record(trade));
    expect(solana).not.toHaveBeenCalled();
    expect(near).toHaveBeenCalledWith(trade, undefined);
  });

  it("Solana failure (undefined sig) still records on NEAR without ref", async () => {
    solana.mockResolvedValue(undefined);
    const { result } = renderHook(() => useReceipts());
    await act(() => result.current.record(trade));
    expect(near).toHaveBeenCalledWith(trade, undefined);
  });

  it("inactive when wallets disconnected or chains toggled off", async () => {
    state.solConnected = false;
    state.accountId = null;
    const { result } = renderHook(() => useReceipts());
    expect(result.current.any).toBe(false);
    await act(() => result.current.record(trade));
    expect(solana).not.toHaveBeenCalled();
    expect(near).not.toHaveBeenCalled();
  });

  it("respects NEAR toggle off while connected", () => {
    useMarket.setState({ chains: { solana: true, near: false } });
    const { result } = renderHook(() => useReceipts());
    expect(result.current.active).toEqual({ solana: true, near: false });
  });
});
