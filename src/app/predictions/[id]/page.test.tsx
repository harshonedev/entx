import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSET_BY_ID } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { yesPrice } from "@/lib/engine";
import { useMarket } from "@/store/market";
import { compactUsd, num, usd } from "@/lib/format";

const nav = vi.hoisted(() => ({ id: "" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: nav.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => `/predictions/${nav.id}`,
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={String(props.src)} />,
}));
vi.mock("@/components/probability-chart", () => ({
  ProbabilityChart: ({ p }: { p: { id: string } }) => <div data-testid="prob-chart">{p.id}</div>,
}));
vi.mock("@/components/near-stake", () => ({
  NearStakePanel: ({ marketId }: { marketId: string }) => <div data-testid="near-stake">{marketId}</div>,
}));
vi.mock("@/lib/receipts", () => ({
  useReceipts: () => ({ any: false, record: vi.fn(), active: { solana: false, near: false } }),
}));

import PredictionMarketPage from "./page";

const p = PREDICTIONS.find((x) => x.assetId && PREDICTIONS.some((y) => y.id !== x.id && y.assetId === x.assetId))!;
const asset = ASSET_BY_ID[p.assetId!];
const header = () => screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
const betAside = () => screen.getByRole("complementary", { name: "Place a bet" });

beforeEach(() => {
  nav.id = p.id;
  useMarket.getState().reset();
  useMarket.setState({ toasts: [], feed: [] });
});

describe("Prediction market page", () => {
  it("shows a not-found state for an unknown id", () => {
    nav.id = "no-such-market";
    render(<PredictionMarketPage />);
    expect(screen.getByText("Market not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse prediction markets" })).toHaveAttribute("href", "/predictions");
    expect(screen.queryByTestId("prob-chart")).not.toBeInTheDocument();
  });

  it("renders the question, category, odds, volume and close date for an open market", () => {
    render(<PredictionMarketPage />);
    const st = useMarket.getState().predictions[p.id];
    const yp = yesPrice(st.pool);
    expect(screen.getByRole("heading", { level: 1, name: p.question })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Prediction markets/ })).toHaveAttribute("href", "/predictions");
    const h = header();
    expect(h).toHaveTextContent(p.category);
    expect(h).toHaveTextContent("Chance of YES");
    expect(h).toHaveTextContent(`${(yp * 100).toFixed(0)}%`);
    expect(h).toHaveTextContent(compactUsd(st.volume));
    expect(h).toHaveTextContent(p.closesInDays === 1 ? "Closes in 1 day" : `Closes in ${p.closesInDays} days`);
    expect(within(h).getByRole("link", { name: `${asset.ticker} · ${asset.title}` })).toHaveAttribute(
      "href",
      `/asset/${asset.id}`,
    );
    expect(screen.getByTestId("prob-chart")).toHaveTextContent(p.id);
  });

  it("renders the ticket, NEAR stake panel, rules and mobile bet bar while open", () => {
    render(<PredictionMarketPage />);
    const yp = yesPrice(useMarket.getState().predictions[p.id].pool);
    const aside = betAside();
    expect(within(aside).getByRole("group", { name: "Outcome" })).toBeInTheDocument();
    expect(within(aside).getByTestId("near-stake")).toHaveTextContent(p.id);
    expect(aside).toHaveTextContent(p.rules);
    expect(screen.getByRole("link", { name: "Place bet" })).toHaveAttribute("href", "#bet");
    expect(screen.getByText(`Yes ${(yp * 100).toFixed(0)}¢`)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your position" })).not.toBeInTheDocument();
  });

  it("links the underlying title and explains the sensitivity", () => {
    render(<PredictionMarketPage />);
    const linked = screen.getByRole("heading", { name: "What moves this market" }).closest("section") as HTMLElement;
    expect(within(linked).getByRole("link", { name: `${asset.title} (${asset.ticker})` })).toHaveAttribute(
      "href",
      `/asset/${asset.id}`,
    );
    expect(within(linked).getByRole("link", { name: `Trade ${asset.ticker}` })).toHaveAttribute(
      "href",
      `/asset/${asset.id}#trade`,
    );
    expect(linked).toHaveTextContent(useMarket.getState().markets[asset.id].epi.toFixed(1));
    expect(linked).toHaveTextContent(
      p.sensitivity > 0 ? "pushes YES up; bad news pushes it down" : "pushes YES down; bad news pushes it up",
    );
  });

  it("lists related markets: same title first, then same category, max 5", () => {
    render(<PredictionMarketPage />);
    const panel = screen.getByRole("heading", { name: "Related markets" }).closest(".panel") as HTMLElement;
    const sameTitle = PREDICTIONS.filter((x) => x.id !== p.id && x.assetId === p.assetId);
    const sameCat = PREDICTIONS.filter((x) => x.id !== p.id && x.category === p.category && !sameTitle.includes(x));
    const expected = [...sameTitle, ...sameCat].slice(0, 5);
    const hrefs = within(panel)
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(expected.map((x) => `/predictions/${x.id}`));
    expect(hrefs).not.toContain(`/predictions/${p.id}`);
  });

  it("related markets show resolved outcomes instead of odds", () => {
    const sibling = PREDICTIONS.find((x) => x.id !== p.id && x.assetId === p.assetId)!;
    act(() => useMarket.getState().resolve(sibling.id, "NO"));
    render(<PredictionMarketPage />);
    const link = screen.getByRole("link", { name: new RegExp(sibling.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    expect(link).toHaveTextContent(/NO$/);
  });

  it("placing a bet via the ticket shows 'Your position' with value and payout", async () => {
    const user = userEvent.setup();
    render(<PredictionMarketPage />);
    const aside = betAside();
    await user.click(within(aside).getByRole("button", { name: /^Yes at/ }));
    const before = useMarket.getState().cash;
    await user.click(within(aside).getByRole("button", { name: "Bet $25 on Yes" }));
    const s = useMarket.getState();
    expect(s.cash).toBeCloseTo(before - 25, 9);
    const pos = s.positions.find((x) => x.marketId === p.id && x.side === "YES")!;
    expect(pos).toBeDefined();

    const panel = screen.getByRole("heading", { name: "Your position" }).closest(".panel") as HTMLElement;
    const yp = yesPrice(s.predictions[p.id].pool);
    expect(panel).toHaveTextContent(`${num(pos.shares, 1)} shares`);
    expect(panel).toHaveTextContent("Value now");
    expect(panel).toHaveTextContent(usd(pos.shares * yp));
    expect(panel).toHaveTextContent("Pays if YES");
    expect(panel).toHaveTextContent(usd(pos.shares));
  });

  it("shows a held position from the store (both sides)", () => {
    act(() => {
      useMarket.getState().predict(p.id, "YES", 30);
      useMarket.getState().predict(p.id, "NO", 10);
    });
    render(<PredictionMarketPage />);
    const panel = screen.getByRole("heading", { name: "Your position" }).closest(".panel") as HTMLElement;
    expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
    expect(panel).toHaveTextContent("Pays if NO");
  });

  it("resolved market: shows outcome, closes betting and hides stake panel and mobile bar", () => {
    act(() => useMarket.getState().resolve(p.id, "YES"));
    render(<PredictionMarketPage />);
    const h = header();
    expect(h).toHaveTextContent("Outcome");
    expect(h).toHaveTextContent("YES");
    expect(h).toHaveTextContent("Closed");
    expect(h).not.toHaveTextContent("Chance of YES");
    expect(screen.getByText("Settled YES")).toBeInTheDocument();
    expect(screen.queryByTestId("near-stake")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Place bet" })).not.toBeInTheDocument();
  });

  it("resolved market with a position held at resolution time", () => {
    // resolve() clears positions from the store, so the post-resolution panel only appears if a position
    // is still present; simulate a persisted position on a resolved market.
    act(() => {
      useMarket.getState().predict(p.id, "YES", 20);
    });
    const pos = useMarket.getState().positions[0];
    act(() => {
      const s = useMarket.getState();
      useMarket.setState({
        predictions: { ...s.predictions, [p.id]: { ...s.predictions[p.id], resolved: "YES" } },
      });
    });
    render(<PredictionMarketPage />);
    const panel = screen.getByRole("heading", { name: "Your position" }).closest(".panel") as HTMLElement;
    expect(panel).toHaveTextContent("Paid out");
    expect(panel).toHaveTextContent(usd(pos.shares));
    expect(panel).toHaveTextContent("Result");
    expect(panel).toHaveTextContent(`+${usd(pos.shares - pos.cost)}`);
    expect(panel).not.toHaveTextContent("Unrealized P&L");
  });

  it("shows activity for the market and its title", () => {
    render(<PredictionMarketPage />);
    const activity = screen.getByRole("heading", { name: "Activity" }).closest(".panel") as HTMLElement;
    expect(activity).toHaveTextContent(`No activity yet. Bets on this market and news on ${asset.ticker} show up here.`);
    act(() => {
      useMarket.getState().predict(p.id, "NO", 5);
    });
    expect(activity).toHaveTextContent(/You bought [\d.]+ NO @/);
  });

  it("shows the past-hour odds change once probability history is available", async () => {
    await act(async () => {
      await useMarket.persist.rehydrate();
    });
    render(<PredictionMarketPage />);
    expect(header()).toHaveTextContent(/(Flat|[▲▼] \d+\.\d pts) · past hour/);
  });
});
