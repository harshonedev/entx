import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { analyze } from "@/lib/analyst";
import { usd } from "@/lib/format";
import { useMarket } from "@/store/market";
import { AnalystCard } from "./analyst-card";

const initial = useMarket.getState();
const asset = ASSETS[0];

beforeEach(() => {
  useMarket.setState(initial, true);
});

function setPrice(p: number) {
  const s = useMarket.getState();
  const m = s.markets[asset.id];
  useMarket.setState({ markets: { ...s.markets, [asset.id]: { ...m, pool: { cash: m.pool.units * p, units: m.pool.units } } } });
}

const RATINGS = /^(Strong buy|Buy|Hold|Sell|Strong sell)$/;

describe("AnalystCard", () => {
  it("renders the analyst's rating, fair value, confidence and summary", () => {
    render(<AnalystCard assetId={asset.id} />);
    const s = useMarket.getState();
    const sig = analyze(asset.id, s.markets[asset.id], s.candles[asset.id], s.predictions);
    expect(screen.getByRole("heading", { name: "ENTX Analyst" })).toBeInTheDocument();
    expect(screen.getByText(sig.rating, { selector: "div" })).toHaveTextContent(RATINGS);
    expect(screen.getByText(usd(sig.fairValue))).toBeInTheDocument();
    expect(screen.getByText(`${sig.confidence}%`)).toBeInTheDocument();
    expect(screen.getByText(`${sig.confidence}%`).parentElement).toHaveTextContent(/^Analyst conviction/);
    expect(screen.getByText(/EPI-implied price/)).toBeInTheDocument();
    expect(screen.getByText(sig.summary)).toBeInTheDocument();
    expect(sig.summary).toContain(asset.ticker);
  });

  it("rates a deeply underpriced title as a buy with green styling and positive upside", () => {
    act(() => setPrice(asset.basePrice * 0.3));
    render(<AnalystCard assetId={asset.id} />);
    const badge = screen.getByText(/^(Strong buy|Buy)$/);
    expect(badge).toHaveClass("text-up");
    expect(screen.getByText(/^\(\+\d+\.\d%\)$/)).toHaveClass("text-up");
  });

  it("rates a deeply overpriced title as a sell with red styling and negative upside", () => {
    act(() => setPrice(asset.basePrice * 4));
    render(<AnalystCard assetId={asset.id} />);
    const badge = screen.getByText(/^(Strong sell|Sell)$/);
    expect(badge).toHaveClass("text-down");
    expect(screen.getByText(/^\(-\d+\.\d%\)$/)).toHaveClass("text-down");
  });

  it("updates the rating live when the price moves", () => {
    render(<AnalystCard assetId={asset.id} />);
    act(() => setPrice(asset.basePrice * 4));
    expect(screen.getByText(/^(Strong sell|Sell)$/)).toBeInTheDocument();
    act(() => setPrice(asset.basePrice * 0.3));
    expect(screen.getByText(/^(Strong buy|Buy)$/)).toBeInTheDocument();
  });

  it("lists the four factors in a collapsible section", async () => {
    const { container } = render(<AnalystCard assetId={asset.id} />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByText("Show the 4 factors behind this rating")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Show the 4 factors behind this rating"));
    expect(details.open).toBe(true);
    for (const name of ["Fundamental gap", "EPI trend", "Price momentum", "Prediction crowd"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    // weights are shown as percentages
    expect(screen.getByText("45%")).toBeInTheDocument();
  });
});
