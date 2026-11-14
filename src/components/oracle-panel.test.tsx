import { act, render, screen } from "@testing-library/react";
import { ASSETS, EPI_LABELS, EPI_WEIGHTS, computeEpi } from "@/lib/assets";
import { useMarket } from "@/store/market";
import { EpiBreakdown } from "./oracle-panel";


const initial = useMarket.getState();
const asset = ASSETS[0];

beforeEach(() => {
  useMarket.setState(initial, true);
});

describe("EpiBreakdown", () => {
  it("shows the current EPI and data confidence", () => {
    render(<EpiBreakdown asset={asset} />);
    expect(screen.getByRole("heading", { name: "Entertainment Popularity Index" })).toBeInTheDocument();
    expect(screen.getByText(computeEpi(asset.epiParts).toFixed(1))).toBeInTheDocument();
    expect(screen.getByText(`Data confidence ${asset.confidence}%`)).toBeInTheDocument();
  });

  it("lists every EPI component with its weight", () => {
    const { container } = render(<EpiBreakdown asset={asset} />);
    const keys = Object.keys(EPI_WEIGHTS) as (keyof typeof EPI_WEIGHTS)[];
    const rows = container.querySelectorAll(".space-y-3 > div");
    expect(rows).toHaveLength(keys.length);
    keys.forEach((k, i) => {
      expect(rows[i]).toHaveTextContent(
        `${EPI_LABELS[k]} · ${Math.round(EPI_WEIGHTS[k] * 100)}%${asset.epiParts[k].toFixed(0)}`,
      );
    });
  });

  it("re-renders when the store's EPI changes", () => {
    const { container } = render(<EpiBreakdown asset={asset} />);
    act(() => {
      const s = useMarket.getState();
      const m = s.markets[asset.id];
      useMarket.setState({
        markets: { ...s.markets, [asset.id]: { ...m, epi: 77.7, epiParts: { ...m.epiParts, critics: 99 } } },
      });
    });
    expect(screen.getByText("77.7")).toBeInTheDocument();
    const keys = Object.keys(EPI_WEIGHTS);
    const row = container.querySelectorAll(".space-y-3 > div")[keys.indexOf("critics")];
    expect(row).toHaveTextContent(/99$/);
  });
});
