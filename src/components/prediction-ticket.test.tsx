import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PREDICTIONS } from "@/lib/predictions";
import { yesPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";

const receipts = vi.hoisted(() => ({ any: false, record: vi.fn(), active: { solana: false, near: false } }));
vi.mock("@/lib/receipts", () => ({ useReceipts: () => receipts }));

import { PredictionTicket } from "./prediction-ticket";

const initial = useMarket.getState();
const p = PREDICTIONS[0];

beforeEach(() => {
  useMarket.setState(initial, true);
  receipts.any = false;
  receipts.record.mockReset();
});

const amountInput = () => screen.getByLabelText("Amount") as HTMLInputElement;
const row = (k: string) => screen.getByText(k).nextElementSibling as HTMLElement;

describe("PredictionTicket", () => {
  it("defaults to YES with a $25 bet and a populated quote", () => {
    render(<PredictionTicket p={p} />);
    const yp = yesPrice(useMarket.getState().predictions[p.id].pool);
    expect(screen.getByRole("button", { name: `Yes at ${(yp * 100).toFixed(0)} cents` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(amountInput().value).toBe("25");
    expect(screen.getByRole("button", { name: "$25" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bet $25 on Yes" })).toBeEnabled();
    expect(row("YES price now")).toHaveTextContent(`${(yp * 100).toFixed(0)}¢`);
    expect(row("Shares")).not.toHaveTextContent("—");
    expect(row("Profit if right").textContent).toMatch(/^\+\$/);
    expect(screen.getByText(/Odds and payouts here are simulated/)).toBeInTheDocument();
  });

  it("switches to NO", async () => {
    const user = userEvent.setup();
    render(<PredictionTicket p={p} />);
    await user.click(screen.getByRole("button", { name: /^No at/ }));
    expect(screen.getByRole("button", { name: /^No at/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("NO price now")).toBeInTheDocument();
    expect(screen.getByText("Payout if NO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bet $25 on No" })).toBeInTheDocument();
  });

  it("strips non-numeric input and disables betting on an empty amount", async () => {
    const user = userEvent.setup();
    render(<PredictionTicket p={p} />);
    await user.clear(amountInput());
    expect(screen.getByRole("button", { name: "Enter an amount" })).toBeDisabled();
    expect(row("Shares")).toHaveTextContent("—");
    await user.type(amountInput(), "1a2b.5");
    expect(amountInput().value).toBe("12.5");
    expect(screen.getByRole("button", { name: "Bet $12.50 on Yes" })).toBeEnabled();
  });

  it("presets and Max set the amount", async () => {
    const user = userEvent.setup();
    useMarket.setState({ cash: 432.9 });
    render(<PredictionTicket p={p} />);
    await user.click(screen.getByRole("button", { name: "$100" }));
    expect(amountInput().value).toBe("100");
    expect(screen.getByRole("button", { name: "$100" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Max:/ }));
    expect(amountInput().value).toBe("432");
  });

  it("blocks bets larger than available cash", async () => {
    const user = userEvent.setup();
    useMarket.setState({ cash: 10 });
    render(<PredictionTicket p={p} />);
    expect(screen.getByRole("button", { name: "Not enough cash · need $15.00 more" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "$10" }));
    expect(screen.getByRole("button", { name: "Bet $10 on Yes" })).toBeEnabled();
  });

  it("places a bet through the store and updates available cash", async () => {
    const user = userEvent.setup();
    render(<PredictionTicket p={p} />);
    await user.click(screen.getByRole("button", { name: "Bet $25 on Yes" }));
    const s = useMarket.getState();
    expect(s.cash).toBeCloseTo(975);
    expect(s.positions[0]).toMatchObject({ marketId: p.id, side: "YES", cost: 25 });
    expect(screen.getByText("$975.00")).toBeInTheDocument();
    expect(receipts.record).not.toHaveBeenCalled();
  });

  it("clamps the amount to remaining cash after a bet", async () => {
    const user = userEvent.setup();
    useMarket.setState({ cash: 30 });
    render(<PredictionTicket p={p} />);
    await user.click(screen.getByRole("button", { name: "Bet $25 on Yes" }));
    expect(useMarket.getState().cash).toBeCloseTo(5);
    expect(amountInput().value).toBe("5");
  });

  it("signs a receipt when a wallet is connected", async () => {
    receipts.any = true;
    const user = userEvent.setup();
    render(<PredictionTicket p={p} />);
    expect(screen.getByText(/receipt will be signed on-chain/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bet $25 on Yes" }));
    expect(receipts.record).toHaveBeenCalledWith(expect.objectContaining({ kind: "YES", total: 25 }));
  });

  it("shows the outcome when the market is settled", () => {
    const st = useMarket.getState().predictions[p.id];
    useMarket.setState({ predictions: { ...useMarket.getState().predictions, [p.id]: { ...st, resolved: "YES" } } });
    render(<PredictionTicket p={p} />);
    expect(screen.getByText("Settled YES")).toBeInTheDocument();
    expect(screen.getByText(/NO shares\s+paid nothing/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
  });
});
