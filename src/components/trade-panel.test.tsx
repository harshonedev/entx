import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSET_BY_ID } from "@/lib/assets";
import { quoteBuy, unitsForDollars } from "@/lib/engine";
import { usd } from "@/lib/format";
import { STARTING_CASH, priceOf, useMarket } from "@/store/market";
import { TradePanel } from "./trade-panel";
// These tests cover the cross-chain view (both wallets), as with the chain switch on.
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), CHAIN_ON: { near: true, solana: true }, MULTICHAIN: true, CHAIN_NAMES: ["NEAR", "Solana"] }));


const receipts = vi.hoisted(() => ({
  record: vi.fn(),
  active: { solana: false, near: false },
  any: false,
}));
vi.mock("@/lib/receipts", () => ({ useReceipts: () => receipts }));

const initial = useMarket.getState();
const asset = ASSET_BY_ID["the-odyssey"];

beforeEach(() => {
  useMarket.setState(initial, true);
  receipts.record.mockReset();
  receipts.active = { solana: false, near: false };
  receipts.any = false;
});

const input = () => screen.getByRole("textbox") as HTMLInputElement;
const submitBtn = () => screen.getByRole("button", { name: /^(Buy|Sell) \d.*ODYSS ·/ });
const actionBtn = () =>
  screen.getByRole("button", { name: /^(Buy \d|Sell \d|Enter a quantity|Not enough cash|You hold)/ });

async function setAmount(v: string) {
  await userEvent.clear(input());
  if (v) await userEvent.type(input(), v);
}

describe("TradePanel", () => {
  it("starts on a $25 buy in dollar mode", () => {
    render(<TradePanel asset={asset} />);
    expect(screen.getByRole("button", { name: "Buy" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dollars" })).toHaveAttribute("aria-pressed", "true");
    expect(input()).toHaveAccessibleName(`Dollars of ${asset.title}`);
    expect(input().value).toBe("25");
    expect(submitBtn()).toBeEnabled();
    expect(submitBtn()).toHaveAccessibleName(/^Buy [\d.]+ ODYSS · \$2\d\.\d\d$/);
    expect(screen.getByText(usd(STARTING_CASH))).toBeInTheDocument();
  });

  it("buys a small order immediately and updates cash and holdings", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(submitBtn());
    const s = useMarket.getState();
    const h = s.holdings[asset.id];
    expect(h.units).toBeGreaterThan(1);
    expect(s.cash).toBeCloseTo(STARTING_CASH - h.cost, 6);
    expect(h.cost).toBeLessThanOrEqual(25);
    expect(h.cost).toBeGreaterThan(24.5);
    expect(s.trades[0]).toMatchObject({ kind: "BUY", refId: asset.id });
    expect(screen.getByText(usd(s.cash))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^${h.units.toFixed(2)} ODYSS$`))).toBeInTheDocument();
    // no receipts when no wallet is connected
    expect(receipts.record).not.toHaveBeenCalled();
  });

  it("confirms the fill on the button, then clears the ticket and refocuses the amount", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(submitBtn());
    const done = screen.getByRole("button", { name: /^Filled · [\d.]+ ODYSS · \$2\d\.\d\d$/ });
    expect(done).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/simulated/);
    expect(input().value).toBe("");
    expect(input()).toHaveFocus();
    // Picking a new amount ends the confirmation early.
    await userEvent.click(screen.getByRole("button", { name: "$10" }));
    expect(screen.queryByRole("button", { name: /^Filled/ })).toBeNull();
    expect(submitBtn()).toBeEnabled();
  });

  it("explains what a unit is next to the amount", () => {
    render(<TradePanel asset={asset} />);
    expect(input()).toHaveAccessibleDescription(/isn't a share of the film/);
  });

  it("doesn't flag price impact on an order that can't be placed", async () => {
    render(<TradePanel asset={asset} />);
    await setAmount("5000");
    expect(screen.getByText("Price impact").nextElementSibling).not.toHaveClass("text-warn");
  });

  it("strips non-numeric characters from the amount", async () => {
    render(<TradePanel asset={asset} />);
    await setAmount("1a2b.5$");
    expect(input().value).toBe("12.5");
  });

  it("asks for a quantity when the amount is empty", async () => {
    render(<TradePanel asset={asset} />);
    await setAmount("");
    expect(screen.getByRole("button", { name: "Enter a quantity" })).toBeDisabled();
  });

  it("applies presets and marks the active one", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: "$50" }));
    expect(input().value).toBe("50");
    expect(screen.getByRole("button", { name: "$50" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "$25" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switching to units carries the order across and swaps presets", async () => {
    render(<TradePanel asset={asset} />);
    await setAmount("100");
    await userEvent.click(screen.getByRole("button", { name: "Units" }));
    expect(input()).toHaveAccessibleName(`Units of ${asset.title}`);
    // $100 at ~$16.43 -> 6.0x units, floored
    expect(input().value).toBe("6");
    expect(screen.getByRole("button", { name: "10" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "$10" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Dollars" }));
    const back = Number(input().value);
    expect(back).toBeGreaterThan(95);
    expect(back).toBeLessThan(105);
  });

  it("blocks a buy the user can't afford and offers the max", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: "Units" }));
    await setAmount("1000");
    const btn = actionBtn();
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleName(/^Not enough cash · need \$[\d,]+\.\d\d more$/);

    const maxBuy = Math.floor(unitsForDollars(initial.markets[asset.id].pool, STARTING_CASH, "buy"));
    await userEvent.click(screen.getByRole("button", { name: `Your cash covers ${maxBuy} units · use that` }));
    expect(input().value).toBe(String(maxBuy));
  });

  it("blocks a units order at or above the pool reserve instead of pricing it negative (regression)", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: "Units" }));
    const reserve = initial.markets[asset.id].pool.units;
    for (const q of [reserve, reserve + 1, reserve * 10]) {
      await setAmount(String(q));
      const btn = screen.getByRole("button", { name: /^Exceeds pool liquidity/ });
      expect(btn).toBeDisabled();
    }
    expect(screen.getByText("Total cost").nextSibling?.textContent).toBe("—");
    expect(useMarket.getState().cash).toBe(STARTING_CASH);
  });

  it("Max fills the largest affordable dollar amount", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: /^All your cash:/ }));
    expect(input().value).toBe(String(Math.floor(STARTING_CASH)));
  });

  it("requires a review for buys over 10% of cash, ignoring a double-click", async () => {
    render(<TradePanel asset={asset} />);
    await setAmount("200");
    await userEvent.click(submitBtn());
    expect(screen.getByText("Review large order")).toBeInTheDocument();
    expect(useMarket.getState().cash).toBe(STARTING_CASH);
    const confirm = screen.getByRole("button", { name: "Confirm buy" });
    expect(confirm).toHaveFocus();
    expect(screen.getByRole("group", { name: "Review large order" })).toHaveTextContent(/That's 20% of your cash/);

    // The tail end of a double-click lands on Confirm within 400ms of it appearing: ignored.
    await userEvent.click(confirm);
    expect(useMarket.getState().cash).toBe(STARTING_CASH);

    // After the 400ms guard (measured on the native event timeStamp) a click confirms.
    await new Promise((r) => setTimeout(r, 420));
    await userEvent.click(confirm);
    const s = useMarket.getState();
    expect(s.cash).toBeLessThan(STARTING_CASH - 195);
    expect(s.holdings[asset.id].units).toBeGreaterThan(11);
    expect(screen.queryByText("Review large order")).toBeNull();
  });

  it("cancelling a review keeps cash untouched, and editing the order drops the review", async () => {
    render(<TradePanel asset={asset} />);
    await setAmount("200");
    await userEvent.click(submitBtn());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Review large order")).toBeNull();
    expect(useMarket.getState().cash).toBe(STARTING_CASH);

    await userEvent.click(submitBtn());
    expect(screen.getByText("Review large order")).toBeInTheDocument();
    await userEvent.type(input(), "0");
    expect(screen.queryByText("Review large order")).toBeNull();
  });

  it("Escape cancels the review and returns focus to the amount", async () => {
    render(<TradePanel asset={asset} />);
    await setAmount("200");
    await userEvent.click(submitBtn());
    expect(screen.getByRole("button", { name: "Confirm buy" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Review large order")).toBeNull();
    expect(input()).toHaveFocus();
    expect(useMarket.getState().cash).toBe(STARTING_CASH);
  });

  it("can't sell what you don't hold", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(screen.getByRole("button", { name: "Sell" })).toHaveAttribute("aria-pressed", "true");
    expect(actionBtn()).toBeDisabled();
    expect(actionBtn()).toHaveAccessibleName("You hold 0 units");
    expect(screen.getByText("You receive")).toBeInTheDocument();
  });

  it("sells held units back for cash", async () => {
    act(() => {
      useMarket.getState().buy(asset.id, 10);
    });
    const afterBuy = useMarket.getState().cash;
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: "Sell" }));
    await userEvent.click(screen.getByRole("button", { name: "Units" }));
    await setAmount("4");
    const btn = submitBtn();
    expect(btn).toHaveAccessibleName(/^Sell 4 ODYSS · \$\d+\.\d\d$/);
    await userEvent.click(btn);
    const s = useMarket.getState();
    expect(s.holdings[asset.id].units).toBeCloseTo(6, 9);
    expect(s.cash).toBeGreaterThan(afterBuy + 60);
    expect(s.trades[0]).toMatchObject({ kind: "SELL", qty: 4 });
  });

  it("clamps the quantity after a sell that leaves less than the entered amount", async () => {
    act(() => {
      useMarket.getState().buy(asset.id, 3);
    });
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: "Sell" }));
    await userEvent.click(screen.getByRole("button", { name: "Units" }));
    await setAmount("3");
    await userEvent.click(submitBtn());
    expect(useMarket.getState().holdings[asset.id]).toBeUndefined();
    expect(input().value).toBe("");
  });

  it("offers to switch to selling when a buy is unaffordable but units are held", async () => {
    act(() => {
      useMarket.getState().buy(asset.id, 5);
    });
    render(<TradePanel asset={asset} />);
    await setAmount("5000");
    await userEvent.click(screen.getByRole("button", { name: "You hold 5 ODYSS · Sell?" }));
    expect(screen.getByRole("button", { name: "Sell" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows price, fee and total consistent with the AMM quote (units mode)", async () => {
    render(<TradePanel asset={asset} />);
    await userEvent.click(screen.getByRole("button", { name: "Units" }));
    await setAmount("10");
    const q = quoteBuy(initial.markets[asset.id].pool, 10);
    expect(screen.getByText("Total cost").nextElementSibling).toHaveTextContent(usd(q.cost));
    expect(screen.getByText("Avg price per unit (incl. fee)").nextElementSibling).toHaveTextContent(usd(q.avg));
    expect(screen.getByText("Market price").nextElementSibling).toHaveTextContent(usd(priceOf(initial.markets[asset.id])));
    expect(screen.getByText("Fee (0.3%)").nextElementSibling).toHaveTextContent(usd(q.cost * 0.003));
  });

  it("records an on-chain receipt when a wallet is connected", async () => {
    receipts.any = true;
    receipts.active = { solana: true, near: false };
    receipts.record.mockResolvedValue(undefined);
    render(<TradePanel asset={asset} />);
    expect(screen.getByText(/written to Solana devnet \(Memo\)\. It is a self-attested record of a simulated trade, not a settlement\./)).toBeInTheDocument();
    await userEvent.click(submitBtn());
    expect(receipts.record).toHaveBeenCalledTimes(1);
    expect(receipts.record).toHaveBeenCalledWith(expect.objectContaining({ kind: "BUY", refId: asset.id }));
  });

  it("mentions both chains when both are active", () => {
    receipts.any = true;
    receipts.active = { solana: true, near: true };
    render(<TradePanel asset={asset} />);
    expect(screen.getByText(/Solana devnet \(Memo\) \+ NEAR testnet/)).toBeInTheDocument();
  });

  it("prompts to connect a wallet when none is connected", () => {
    render(<TradePanel asset={asset} />);
    expect(screen.getByText(/Optional: connect a Solana or NEAR wallet/)).toBeInTheDocument();
  });
});
