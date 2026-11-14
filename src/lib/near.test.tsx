import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useMarket, type Trade } from "@/store/market";

type Handler = (t: { accounts: { accountId: string }[] }) => void;
const handlers: Record<string, Handler> = {};
const signAndSendTransaction = vi.fn();
const connector = {
  whenManifestLoaded: Promise.resolve(),
  getConnectedWallet: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  wallet: vi.fn(async () => ({ signAndSendTransaction })),
  on: vi.fn((ev: string, h: Handler) => {
    handlers[ev] = h;
  }),
};
vi.mock("@hot-labs/near-connect", () => ({
  NearConnector: vi.fn(function () {
    return connector;
  }),
}));

import { NearProvider, useNear, useNearNotarize } from "./near";
import { NEAR_CONTRACT } from "./near-config";

const wrapper = ({ children }: { children: ReactNode }) => <NearProvider>{children}</NearProvider>;

const trade = (over: Partial<Trade> = {}): Trade => ({
  id: "t1",
  ts: 0,
  kind: "BUY",
  refId: "asset-1",
  label: "TICK",
  qty: 2.5,
  price: 12.3456789,
  total: 30,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  connector.getConnectedWallet.mockReset().mockResolvedValue({ accounts: [{ accountId: "alice.testnet" }] });
  signAndSendTransaction.mockReset().mockResolvedValue({ transaction: { hash: "NEARHASH1234" } });
  connector.connect.mockReset();
  connector.disconnect.mockReset();
  useMarket.setState({ toasts: [], trades: [trade()] });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("NearProvider / useNear", () => {
  it("default context outside provider throws on call", async () => {
    const { result } = renderHook(() => useNear());
    expect(result.current.accountId).toBeNull();
    expect(result.current.ready).toBe(false);
    await expect(result.current.call("x", {})).rejects.toThrow("NEAR not ready");
  });

  it("restores a connected wallet and becomes ready", async () => {
    const { result } = renderHook(() => useNear(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.accountId).toBe("alice.testnet");
  });

  it("becomes ready with no account when none connected", async () => {
    connector.getConnectedWallet.mockRejectedValue(new Error("none"));
    const { result } = renderHook(() => useNear(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.accountId).toBeNull();
  });

  it("tracks signIn / signOut events and disconnect()", async () => {
    connector.getConnectedWallet.mockRejectedValue(new Error("none"));
    const { result } = renderHook(() => useNear(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => handlers["wallet:signIn"]({ accounts: [{ accountId: "bob.testnet" }] }));
    expect(result.current.accountId).toBe("bob.testnet");
    act(() => handlers["wallet:signOut"]({ accounts: [] }));
    expect(result.current.accountId).toBeNull();

    act(() => handlers["wallet:signIn"]({ accounts: [{ accountId: "bob.testnet" }] }));
    await act(() => result.current.disconnect());
    expect(connector.disconnect).toHaveBeenCalled();
    expect(result.current.accountId).toBeNull();
  });

  it("connect() delegates to the connector", async () => {
    const { result } = renderHook(() => useNear(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.connect());
    expect(connector.connect).toHaveBeenCalled();
  });

  it("call() sends a FunctionCall to the contract with gas and deposit", async () => {
    const { result } = renderHook(() => useNear(), { wrapper });
    await waitFor(() => expect(result.current.accountId).toBe("alice.testnet"));
    const hash = await result.current.call("stake", { a: 1 }, "5", 30);
    expect(hash).toBe("NEARHASH1234");
    expect(signAndSendTransaction).toHaveBeenCalledWith({
      receiverId: NEAR_CONTRACT,
      actions: [
        { type: "FunctionCall", params: { methodName: "stake", args: { a: 1 }, gas: "30000000000000", deposit: "5" } },
      ],
    });
  });

  it("call() falls back to transaction_outcome id, and throws on Failure status", async () => {
    const { result } = renderHook(() => useNear(), { wrapper });
    await waitFor(() => expect(result.current.accountId).toBe("alice.testnet"));
    signAndSendTransaction.mockResolvedValueOnce({ transaction_outcome: { id: "OUTCOME" } });
    expect(await result.current.call("m", {})).toBe("OUTCOME");
    signAndSendTransaction.mockResolvedValueOnce({ status: { Failure: { reason: "bad" } } });
    await expect(result.current.call("m", {})).rejects.toThrow(/bad/);
  });

  it("call() without account throws", async () => {
    connector.getConnectedWallet.mockRejectedValue(new Error("none"));
    const { result } = renderHook(() => useNear(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await expect(result.current.call("m", {})).rejects.toThrow("Connect a NEAR wallet first");
  });
});

describe("useNearNotarize", () => {
  async function setup() {
    const { result } = renderHook(() => ({ notarize: useNearNotarize(), near: useNear() }), { wrapper });
    await waitFor(() => expect(result.current.near.accountId).toBe("alice.testnet"));
    return result;
  }

  it("records the trade on NEAR with micro units and chain_ref, then confirms", async () => {
    const r = await setup();
    await act(() => r.current.notarize(trade(), "solana:devnet:SIG"));
    const params = signAndSendTransaction.mock.calls[0][0].actions[0].params;
    expect(params.methodName).toBe("record_trade");
    expect(params.args).toEqual({
      market_id: "asset-1",
      side: "BUY",
      qty_micro: 2_500_000,
      price_micro: 12_345_679,
      chain_ref: "solana:devnet:SIG",
    });
    expect(params.deposit).toBe("10000000000000000000000");
    expect(useMarket.getState().trades[0]).toMatchObject({ nearTx: "NEARHASH1234", nearStatus: "confirmed" });
    expect(useMarket.getState().toasts.at(-1)!.title).toBe("Receipt recorded on NEAR testnet");
  });

  it("qty_micro is at least 1 and chain_ref null when absent", async () => {
    const r = await setup();
    await act(() => r.current.notarize(trade({ qty: 0 })));
    const args = signAndSendTransaction.mock.calls[0][0].actions[0].params.args;
    expect(args.qty_micro).toBe(1);
    expect(args.chain_ref).toBeNull();
  });

  it("skips PAYOUT trades", async () => {
    const r = await setup();
    await act(() => r.current.notarize(trade({ kind: "PAYOUT" })));
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it("marks failed and toasts when the wallet rejects", async () => {
    const r = await setup();
    signAndSendTransaction.mockRejectedValue(new Error("User rejected"));
    await act(() => r.current.notarize(trade()));
    expect(useMarket.getState().trades[0].nearStatus).toBe("failed");
    expect(useMarket.getState().toasts.at(-1)).toMatchObject({ title: "NEAR receipt not recorded", tone: "down" });
  });

  it("marks failed when the wallet resolves without a transaction (nothing reached the chain)", async () => {
    const r = await setup();
    signAndSendTransaction.mockResolvedValue(undefined);
    await act(() => r.current.notarize(trade()));
    expect(useMarket.getState().trades[0].nearStatus).toBe("failed");
    expect(useMarket.getState().toasts.at(-1)).toMatchObject({ title: "NEAR receipt not recorded", tone: "down" });
    // A stale wallet session is the usual cause; dropping it makes the next connect start clean.
    expect(connector.disconnect).toHaveBeenCalled();
    expect(useMarket.getState().toasts.at(-1)?.body).toMatch(/reconnect/i);
  });

  it("no-op without a connected account", async () => {
    connector.getConnectedWallet.mockRejectedValue(new Error("none"));
    const { result } = renderHook(() => ({ notarize: useNearNotarize(), near: useNear() }), { wrapper });
    await waitFor(() => expect(result.current.near.ready).toBe(true));
    await act(() => result.current.notarize(trade()));
    expect(signAndSendTransaction).not.toHaveBeenCalled();
    expect(useMarket.getState().trades[0].nearStatus).toBeUndefined();
  });
});
