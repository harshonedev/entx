import { render, screen } from "@testing-library/react";
import { useMarket, type Trade } from "@/store/market";
import { FillReceipt } from "./fill-receipt";

const initial = useMarket.getState();

function seedTrade(patch: Partial<Trade>) {
  useMarket.setState(initial, true);
  const t = useMarket.getState().buy(Object.keys(initial.markets)[0], 2)!;
  useMarket.setState({ trades: useMarket.getState().trades.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) });
  return t.id;
}

describe("FillReceipt", () => {
  it("links to the portfolio after a normal fill", () => {
    const id = seedTrade({});
    render(<FillReceipt tradeId={id} unit="ODYSS" onDone={() => {}} />);
    expect(screen.getByRole("link", { name: "View in portfolio" })).toHaveAttribute("href", "/portfolio");
    expect(screen.queryByText(/Receipt not signed/)).toBeNull();
  });

  it("turns a failed on-chain receipt into a real retry link", () => {
    const id = seedTrade({ nearStatus: "failed" });
    render(<FillReceipt tradeId={id} unit="ODYSS" onDone={() => {}} />);
    expect(screen.getByText(/Receipt not signed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retry in Portfolio" })).toHaveAttribute("href", "/portfolio#trade-history");
    expect(screen.queryByRole("link", { name: "View in portfolio" })).toBeNull();
  });
});
