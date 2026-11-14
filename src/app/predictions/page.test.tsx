import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PREDICTIONS } from "@/lib/predictions";
import { useMarket } from "@/store/market";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={String(props.src)} />,
}));
vi.mock("@/lib/receipts", () => ({
  useReceipts: () => ({ any: false, record: vi.fn(), active: { solana: false, near: false } }),
}));
vi.mock("@/components/near-stake", () => ({
  NearStakePanel: ({ marketId }: { marketId: string }) => <div data-testid="near-stake">{marketId}</div>,
}));

import PredictionsPage from "./page";

const shownIds = () =>
  screen
    .getAllByRole("link")
    .map((l) => l.getAttribute("href")!)
    .filter((h) => h.startsWith("/predictions/"))
    .map((h) => h.slice("/predictions/".length));

beforeEach(() => {
  useMarket.getState().reset();
  useMarket.setState({ toasts: [] });
});

describe("Predictions page", () => {
  it("renders heading and every market by default", () => {
    render(<PredictionsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Prediction markets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(new Set(shownIds())).toEqual(new Set(PREDICTIONS.map((p) => p.id)));
    for (const p of PREDICTIONS) {
      expect(screen.getByRole("link", { name: p.question })).toHaveAttribute("href", `/predictions/${p.id}`);
    }
  });

  it.each(["Box office", "Awards", "Renewal", "Popularity"] as const)("filters to %s", async (cat) => {
    const user = userEvent.setup();
    render(<PredictionsPage />);
    await user.click(screen.getByRole("button", { name: cat }));
    expect(screen.getByRole("button", { name: cat })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    const expected = PREDICTIONS.filter((p) => p.category === cat).map((p) => p.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(shownIds())).toEqual(new Set(expected));
  });

  it("returns to all markets from a filter", async () => {
    const user = userEvent.setup();
    render(<PredictionsPage />);
    await user.click(screen.getByRole("button", { name: "Awards" }));
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(new Set(shownIds())).toEqual(new Set(PREDICTIONS.map((p) => p.id)));
  });

  it("reflects resolved markets from the store", () => {
    const p = PREDICTIONS[0];
    render(<PredictionsPage />);
    expect(screen.getAllByRole("button", { name: /^Bet YES at/ })).toHaveLength(PREDICTIONS.length);
    act(() => useMarket.getState().resolve(p.id, "YES"));
    // A resolved card no longer offers YES/NO bets.
    expect(screen.queryAllByRole("button", { name: /^Bet YES at/ })).toHaveLength(PREDICTIONS.length - 1);
    expect(screen.getByText("Settled YES")).toBeInTheDocument();
  });
});
