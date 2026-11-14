import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PREDICTIONS } from "@/lib/predictions";
import { ASSET_BY_ID } from "@/lib/assets";
import { yesPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";

const receipts = vi.hoisted(() => ({ any: false, record: vi.fn(), active: { solana: false, near: false } }));

vi.mock("@/lib/receipts", () => ({ useReceipts: () => receipts }));
vi.mock("./near-stake", () => ({
  NearStakePanel: ({ marketId }: { marketId: string }) => <div data-testid="near-stake">stake:{marketId}</div>,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt="" src={String(props.src)} />,
}));

import { PredictionCard } from "./prediction-card";

const initial = useMarket.getState();
const p = PREDICTIONS[0];
const asset = ASSET_BY_ID[p.assetId!];

beforeEach(() => {
  useMarket.setState(initial, true);
  receipts.any = false;
  receipts.record.mockReset();
});

const yesBtn = () => screen.getByRole("button", { name: /^Pick YES at/ });
const noBtn = () => screen.getByRole("button", { name: /^Pick NO at/ });

describe("PredictionCard", () => {
  it("renders question, category, ticker, odds and links", () => {
    render(<PredictionCard p={p} />);
    const yp = yesPrice(useMarket.getState().predictions[p.id].pool);
    expect(screen.getByRole("link", { name: p.question })).toHaveAttribute("href", `/predictions/${p.id}`);
    expect(screen.getByText(p.category)).toBeInTheDocument();
    expect(screen.getByText(asset.ticker)).toBeInTheDocument();
    expect(screen.getByText(`${(yp * 100).toFixed(0)}%`)).toBeInTheDocument();
    expect(screen.getByText(`${p.closesInDays}d left`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `${asset.title} (${asset.ticker})` })).toHaveAttribute(
      "href",
      `/asset/${asset.id}`,
    );
    expect(yesBtn()).toHaveAccessibleName(`Pick YES at ${(yp * 100).toFixed(1)} cents`);
    expect(noBtn()).toHaveAccessibleName(`Pick NO at ${((1 - yp) * 100).toFixed(1)} cents`);
  });

  it("compact mode hides the poster link and rules toggle", () => {
    render(<PredictionCard p={p} compact />);
    expect(screen.queryByRole("link", { name: `${asset.title} (${asset.ticker})` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rules/ })).not.toBeInTheDocument();
  });

  it("selecting a side opens the ticket and toggles off on second click", async () => {
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    expect(screen.queryByRole("button", { name: /^Bet \$/ })).not.toBeInTheDocument();
    await user.click(yesBtn());
    expect(yesBtn()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bet $25 on YES" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "$25" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Payout if YES")).toBeInTheDocument();
    await user.click(yesBtn());
    expect(yesBtn()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Payout if YES")).not.toBeInTheDocument();
  });

  it("opens the ticket as a labelled dialog, moves focus into it, and the close button returns focus", async () => {
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    await user.click(yesBtn());
    const dialog = screen.getByRole("dialog", { name: /Yes at/ });
    // Desktop (no phone media match): a non-modal popover.
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(within(dialog).getByRole("button", { name: "$25" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Close ticket" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(yesBtn()).toHaveFocus();
  });

  it("closes the popover on a pointer press outside the card", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PredictionCard p={p} />
        <button>elsewhere</button>
      </>,
    );
    await user.click(noBtn());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a modal bottom sheet on phones with a scroll lock and Tab trap", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    try {
      const user = userEvent.setup();
      render(<PredictionCard p={p} />);
      await user.click(yesBtn());
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(document.body.style.overflow).toBe("hidden");
      const close = within(dialog).getByRole("button", { name: "Close ticket" });
      close.focus();
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(dialog.contains(document.activeElement)).toBe(true);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe("");
      expect(yesBtn()).toHaveFocus();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("places a YES bet: debits cash, adds a position and closes the ticket", async () => {
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    await user.click(yesBtn());
    await user.click(screen.getByRole("button", { name: "Bet $25 on YES" }));

    const s = useMarket.getState();
    expect(s.cash).toBeCloseTo(975);
    expect(s.positions).toHaveLength(1);
    expect(s.positions[0]).toMatchObject({ marketId: p.id, side: "YES", cost: 25 });
    expect(s.trades[0]).toMatchObject({ kind: "YES", refId: p.id, total: 25 });
    expect(screen.queryByRole("button", { name: /^Bet \$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Your YES:/)).toBeInTheDocument();
    expect(receipts.record).not.toHaveBeenCalled();
  });

  it("places a NO bet with a different preset amount", async () => {
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    await user.click(noBtn());
    await user.click(screen.getByRole("button", { name: "$50" }));
    await user.click(screen.getByRole("button", { name: "Bet $50 on NO" }));
    const s = useMarket.getState();
    expect(s.cash).toBeCloseTo(950);
    expect(s.positions[0]).toMatchObject({ side: "NO", cost: 50 });
    expect(screen.getByText(/Your NO:/)).toBeInTheDocument();
  });

  it("records an on-chain receipt when a wallet is active", async () => {
    receipts.any = true;
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    await user.click(yesBtn());
    await user.click(screen.getByRole("button", { name: "Bet $25 on YES" }));
    expect(receipts.record).toHaveBeenCalledTimes(1);
    expect(receipts.record.mock.calls[0][0]).toMatchObject({ kind: "YES", total: 25 });
  });

  it("disables the bet when cash is insufficient", async () => {
    useMarket.setState({ cash: 5 });
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    await user.click(yesBtn());
    const btn = screen.getByRole("button", { name: "Not enough cash · need $20.00 more" });
    expect(btn).toBeDisabled();
  });

  describe("large bet review (>10% of cash)", () => {
    beforeEach(() => {
      useMarket.setState({ cash: 200 });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("asks for confirmation, ignores an immediate double-click, then places after confirm", () => {
      render(<PredictionCard p={p} />);
      fireEvent.click(yesBtn());
      fireEvent.click(screen.getByRole("button", { name: "Bet $25 on YES" }));
      expect(useMarket.getState().cash).toBe(200);
      const confirm = screen.getByRole("button", { name: "Confirm · $25 on YES (13% of cash)" });
      expect(screen.getByRole("status")).toHaveTextContent("Large bet. Check it, then confirm.");

      // tail of a double-click (<400ms) is ignored
      fireEvent.click(confirm);
      expect(useMarket.getState().cash).toBe(200);

      vi.setSystemTime(Date.now() + 1000);
      fireEvent.click(confirm);
      expect(useMarket.getState().cash).toBeCloseTo(175);
      expect(useMarket.getState().positions).toHaveLength(1);
    });

    it("Escape backs out of the review, then closes the ticket and refocuses the side", () => {
      render(<PredictionCard p={p} />);
      fireEvent.click(yesBtn());
      const bet = screen.getByRole("button", { name: "Bet $25 on YES" });
      fireEvent.click(bet);
      expect(screen.getByRole("status")).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("button", { name: /^Confirm/ }), { key: "Escape" });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("button", { name: "Bet $25 on YES" }), { key: "Escape" });
      expect(screen.queryByRole("button", { name: /^Bet \$/ })).not.toBeInTheDocument();
      expect(yesBtn()).toHaveFocus();
      expect(yesBtn()).toHaveAttribute("aria-pressed", "false");
    });

    it("cancel drops the pending confirmation", () => {
      render(<PredictionCard p={p} />);
      fireEvent.click(yesBtn());
      fireEvent.click(screen.getByRole("button", { name: "Bet $25 on YES" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("button", { name: "Bet $25 on YES" })).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("changing amount resets the review", () => {
      render(<PredictionCard p={p} />);
      fireEvent.click(yesBtn());
      fireEvent.click(screen.getByRole("button", { name: "Bet $25 on YES" }));
      fireEvent.click(screen.getByRole("button", { name: "$50" }));
      expect(screen.getByRole("button", { name: "Bet $50 on YES" })).toBeInTheDocument();
    });
  });

  it("shows a settled state with no betting controls", () => {
    const st = useMarket.getState().predictions[p.id];
    useMarket.setState({ predictions: { ...useMarket.getState().predictions, [p.id]: { ...st, resolved: "NO" } } });
    render(<PredictionCard p={p} />);
    expect(screen.getByText("Settled NO")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bet YES/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stake testnet NEAR on-chain/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rules/ })).not.toBeInTheDocument();
  });

  it("toggles the rules text", async () => {
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    const rules = screen.getByRole("button", { name: /Rules/ });
    expect(rules).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(p.rules)).not.toBeInTheDocument();
    await user.click(rules);
    expect(rules).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(p.rules)).toBeInTheDocument();
  });

  it("mounts the NEAR staking panel on request", async () => {
    const user = userEvent.setup();
    render(<PredictionCard p={p} />);
    expect(screen.queryByTestId("near-stake")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stake testnet NEAR on-chain" }));
    expect(screen.getByTestId("near-stake")).toHaveTextContent(`stake:${p.id}`);
    expect(screen.queryByRole("button", { name: "Stake testnet NEAR on-chain" })).not.toBeInTheDocument();
  });

  it("lists existing positions valued at the current price", () => {
    useMarket.setState({ positions: [{ marketId: p.id, side: "YES", shares: 10, cost: 4 }] });
    render(<PredictionCard p={p} />);
    const yp = yesPrice(useMarket.getState().predictions[p.id].pool);
    const row = screen.getByText(/Your YES:/).closest("div")!;
    expect(within(row).getByText("10.0")).toBeInTheDocument();
    expect(row).toHaveTextContent(`$${(10 * yp).toFixed(2)}`);
  });

  it("re-renders live when the pool moves", () => {
    render(<PredictionCard p={p} />);
    const st = useMarket.getState().predictions[p.id];
    act(() => {
      useMarket.setState({
        predictions: { ...useMarket.getState().predictions, [p.id]: { ...st, pool: { yes: 100, no: 300 } } },
      });
    });
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
