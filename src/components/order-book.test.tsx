import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { poolPrice } from "@/lib/engine";
import { usd } from "@/lib/format";
import { useMarket } from "@/store/market";
import { OrderBook } from "./order-book";

const initial = useMarket.getState();
const asset = ASSETS[0];
const parse = (s: string) => Number(s.replace(/[^0-9.]/g, ""));

beforeEach(() => {
  useMarket.setState(initial, true);
});

function rows() {
  const body = screen.getAllByRole("rowgroup")[1];
  return within(body).getAllByRole("row");
}

describe("OrderBook", () => {
  it("renders a collapsible 'Market depth' panel, closed by default", async () => {
    const { container } = render(<OrderBook assetId={asset.id} />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByRole("heading", { name: "Market depth" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Market depth"));
    expect(details.open).toBe(true);
  });

  it("shows 7 ask levels, the current price, then 7 bid levels", () => {
    render(<OrderBook assetId={asset.id} />);
    const r = rows();
    expect(r).toHaveLength(15);
    const p0 = poolPrice(initial.markets[asset.id].pool);
    expect(r[7]).toHaveTextContent(`${usd(p0)} current price`);
    for (let i = 0; i < 7; i++) expect(r[i]).toHaveTextContent(/^Sell at/);
    for (let i = 8; i < 15; i++) expect(r[i]).toHaveTextContent(/^Buy at/);
  });

  it("orders prices descending from top ask to bottom bid, straddling the current price", () => {
    render(<OrderBook assetId={asset.id} />);
    const p0 = poolPrice(initial.markets[asset.id].pool);
    const r = rows();
    const prices = [...r.slice(0, 7), ...r.slice(8)].map((row) => parse(within(row).getAllByRole("cell")[0].textContent!));
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeLessThan(prices[i - 1]);
    expect(prices[6]).toBeGreaterThan(p0);
    expect(prices[7]).toBeLessThan(p0);
    // nearest levels sit one 0.25% step away
    expect(prices[6]).toBeCloseTo(p0 * 1.0025, 2);
    expect(prices[7]).toBeCloseTo(p0 * 0.9975, 2);
  });

  it("accumulates size into a growing total moving away from the mid", () => {
    render(<OrderBook assetId={asset.id} />);
    const r = rows();
    const totals = (list: HTMLElement[]) => list.map((row) => parse(within(row).getAllByRole("cell")[2].textContent!));
    const bidTotals = totals(r.slice(8));
    const askTotals = totals(r.slice(0, 7)).reverse();
    for (let i = 1; i < 7; i++) {
      expect(bidTotals[i]).toBeGreaterThan(bidTotals[i - 1]);
      expect(askTotals[i]).toBeGreaterThan(askTotals[i - 1]);
    }
  });

  it("updates when the pool price moves", () => {
    render(<OrderBook assetId={asset.id} />);
    act(() => {
      const s = useMarket.getState();
      const m = s.markets[asset.id];
      useMarket.setState({ markets: { ...s.markets, [asset.id]: { ...m, pool: { cash: m.pool.units * 20, units: m.pool.units } } } });
    });
    expect(rows()[7]).toHaveTextContent("$20.00 current price");
  });
});
