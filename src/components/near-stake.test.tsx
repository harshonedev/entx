import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nearToYocto, type NearMarket, type NearStake } from "@/lib/near-config";
import { useMarket } from "@/store/market";

const near = vi.hoisted(() => ({
  accountId: null as string | null,
  ready: true,
  connect: vi.fn(),
  call: vi.fn(),
}));
vi.mock("@/lib/near", () => ({ useNear: () => near }));

const view = vi.hoisted(() => ({ market: null as unknown, stake: null as unknown, fn: vi.fn() }));
vi.mock("@/lib/near-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/near-config")>()),
  nearView: view.fn,
}));

import { NearStakePanel } from "./near-stake";

const initial = useMarket.getState();
const N = (n: number) => (BigInt(Math.round(n * 1000)) * BigInt("1000000000000000000000")).toString();

const market = (o: Partial<NearMarket> = {}): NearMarket => ({
  id: "m1",
  kind: "Prediction",
  title: "t",
  ticker: "T",
  epi_x10: 0,
  status: "Open",
  created_at_ms: 0,
  trades: 0,
  volume_micro_usd: 0,
  oracle_updates: 0,
  yes_pool: N(2),
  no_pool: N(1),
  ...o,
});
const stakeOf = (o: Partial<NearStake> = {}): NearStake => ({ yes: "0", no: "0", claimed: false, ...o });

beforeEach(() => {
  useMarket.setState(initial, true);
  near.accountId = null;
  near.ready = true;
  near.connect.mockReset();
  near.call.mockReset();
  view.market = market();
  view.stake = null;
  view.fn.mockReset();
  view.fn.mockImplementation(async (method: string) => (method === "get_market" ? view.market : view.stake));
});

describe("NearStakePanel", () => {
  it("shows a loading state until the pool is read", async () => {
    view.fn.mockImplementation(() => new Promise(() => {}));
    render(<NearStakePanel marketId="m1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Reading the NEAR pool…");
  });

  it("renders pool totals and prompts to connect when signed out", async () => {
    const user = userEvent.setup();
    render(<NearStakePanel marketId="m1" />);
    expect(await screen.findByText("3.00 NEAR staked")).toBeInTheDocument();
    expect(screen.getByText("YES 2.00 Ⓝ")).toBeInTheDocument();
    expect(screen.getByText("NO 1.00 Ⓝ")).toBeInTheDocument();
    expect(view.fn).toHaveBeenCalledWith("get_market", { market_id: "m1" });
    expect(view.fn).not.toHaveBeenCalledWith("get_stake", expect.anything());
    await user.click(screen.getByRole("button", { name: /Connect a NEAR wallet/ }));
    expect(near.connect).toHaveBeenCalled();
  });

  it("disables connect until the NEAR connector is ready", async () => {
    near.ready = false;
    render(<NearStakePanel marketId="m1" />);
    expect(await screen.findByRole("button", { name: /Connect a NEAR wallet/ })).toBeDisabled();
  });

  it("stakes the chosen amount on a side and reports the tx", async () => {
    near.accountId = "alice.testnet";
    near.call.mockResolvedValue("HASH1234567890abc");
    const user = userEvent.setup();
    render(<NearStakePanel marketId="m1" />);
    await screen.findByText("3.00 NEAR staked");
    expect(view.fn).toHaveBeenCalledWith("get_stake", { market_id: "m1", account_id: "alice.testnet" });

    await user.click(screen.getByRole("button", { name: "0.5Ⓝ" }));
    await user.click(screen.getByRole("button", { name: "YES" }));

    expect(near.call).toHaveBeenCalledWith("stake", { market_id: "m1", outcome: true }, nearToYocto(0.5), 30);
    const link = await screen.findByRole("link", { name: /Last tx HASH1234/ });
    expect(link).toHaveAttribute("href", "https://testnet.nearblocks.io/txns/HASH1234567890abc");
    expect(useMarket.getState().toasts.at(-1)).toMatchObject({ title: "Staked 0.5 NEAR on YES", tone: "up" });
  });

  it("disables both sides while a stake is in flight", async () => {
    near.accountId = "alice.testnet";
    let resolve!: (v: string) => void;
    near.call.mockImplementation(() => new Promise<string>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<NearStakePanel marketId="m1" />);
    await screen.findByText("3.00 NEAR staked");
    await user.click(screen.getByRole("button", { name: "NO" }));
    expect(near.call).toHaveBeenCalledWith("stake", { market_id: "m1", outcome: false }, nearToYocto(0.1), 30);
    expect(screen.getByRole("button", { name: "YES" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "NO" })).toBeDisabled();
    resolve("H");
    await waitFor(() => expect(screen.getByRole("button", { name: "YES" })).toBeEnabled());
  });

  it("toasts a failure when the transaction is rejected", async () => {
    near.accountId = "alice.testnet";
    near.call.mockRejectedValue(new Error("User rejected"));
    const user = userEvent.setup();
    render(<NearStakePanel marketId="m1" />);
    await screen.findByText("3.00 NEAR staked");
    await user.click(screen.getByRole("button", { name: "YES" }));
    await waitFor(() =>
      expect(useMarket.getState().toasts.at(-1)).toMatchObject({
        title: "NEAR transaction failed",
        body: "User rejected",
        tone: "down",
      }),
    );
    expect(screen.queryByRole("link", { name: /Last tx/ })).not.toBeInTheDocument();
  });

  it("shows the user's existing stake", async () => {
    near.accountId = "alice.testnet";
    view.stake = stakeOf({ yes: N(0.5), no: N(0.25) });
    render(<NearStakePanel marketId="m1" />);
    expect(await screen.findByText("Your stake: 0.500 Ⓝ YES · 0.250 Ⓝ NO")).toBeInTheDocument();
  });

  it("offers a parimutuel claim to winners once resolved", async () => {
    near.accountId = "alice.testnet";
    near.call.mockResolvedValue("CLAIMHASH99");
    view.market = market({ status: { Resolved: { outcome: true } } });
    view.stake = stakeOf({ yes: N(1) });
    const user = userEvent.setup();
    render(<NearStakePanel marketId="m1" />);
    expect(await screen.findByText("Resolved YES on-chain.")).toBeInTheDocument();
    // 1 of 2 winning NEAR, total pool 3 → 1.5
    await user.click(screen.getByRole("button", { name: "Claim 1.500 NEAR" }));
    expect(near.call).toHaveBeenCalledWith("claim", { market_id: "m1" }, "0", 50);
    await waitFor(() => expect(useMarket.getState().toasts.at(-1)?.title).toBe("Payout claimed"));
    expect(screen.queryByRole("button", { name: /^(YES|NO)$/ })).not.toBeInTheDocument();
  });

  it("shows Claimed. after the payout was taken", async () => {
    near.accountId = "alice.testnet";
    view.market = market({ status: { Resolved: { outcome: true } } });
    view.stake = stakeOf({ yes: N(1), claimed: true });
    render(<NearStakePanel marketId="m1" />);
    expect(await screen.findByText("Claimed.")).toBeInTheDocument();
  });

  it("tells losers there is no payout", async () => {
    near.accountId = "alice.testnet";
    view.market = market({ status: { Resolved: { outcome: false } } });
    view.stake = stakeOf({ yes: N(1) });
    render(<NearStakePanel marketId="m1" />);
    expect(await screen.findByText("Resolved NO on-chain.")).toBeInTheDocument();
    expect(screen.getByText("No payout for this stake.")).toBeInTheDocument();
  });

  it("refunds everyone when the winning side is empty", async () => {
    near.accountId = "alice.testnet";
    view.market = market({ status: { Resolved: { outcome: true } }, yes_pool: "0", no_pool: N(1) });
    view.stake = stakeOf({ no: N(1) });
    render(<NearStakePanel marketId="m1" />);
    expect(await screen.findByRole("button", { name: "Claim 1.000 NEAR" })).toBeInTheDocument();
  });

  describe("polling", () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it("re-reads the pool every 12s", async () => {
      render(<NearStakePanel marketId="m1" />);
      await screen.findByText("3.00 NEAR staked");
      view.market = market({ yes_pool: N(4), no_pool: N(1) });
      await act(() => vi.advanceTimersByTimeAsync(12_000));
      expect(screen.getByText("5.00 NEAR staked")).toBeInTheDocument();
    });

    it("keeps the last state when an RPC read fails", async () => {
      render(<NearStakePanel marketId="m1" />);
      await screen.findByText("3.00 NEAR staked");
      const calls = view.fn.mock.calls.length;
      view.fn.mockRejectedValue(new Error("rpc"));
      await act(() => vi.advanceTimersByTimeAsync(12_000));
      expect(view.fn.mock.calls.length).toBeGreaterThan(calls);
      expect(screen.getByText("3.00 NEAR staked")).toBeInTheDocument();
    });

    it("stops polling on unmount", async () => {
      const { unmount } = render(<NearStakePanel marketId="m1" />);
      await screen.findByText("3.00 NEAR staked");
      unmount();
      const calls = view.fn.mock.calls.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(view.fn.mock.calls.length).toBe(calls);
    });
  });
});
