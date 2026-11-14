import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { priceOf, useMarket } from "@/store/market";
import { compactUsd, usd } from "@/lib/format";

const nav = vi.hoisted(() => ({ id: "" }));
const receipts = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: nav.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => `/asset/${nav.id}`,
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={String(props.src)} />,
}));
vi.mock("@/components/price-chart", () => ({
  PriceChart: ({ assetId, step }: { assetId: string; step: number }) => (
    <div data-testid="price-chart">
      {assetId}:{step}
    </div>
  ),
}));
vi.mock("@/components/near-stake", () => ({
  NearStakePanel: ({ marketId }: { marketId: string }) => <div data-testid="near-stake">{marketId}</div>,
}));
vi.mock("@/lib/receipts", () => ({
  useReceipts: () => ({ any: false, record: receipts.record, active: { solana: false, near: false } }),
}));
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null }),
  useConnection: () => ({ connection: {} }),
}));

import AssetPage from "./page";

// A title with linked prediction markets, and one without (if the catalogue has one).
const withPreds = ASSETS.find((a) => PREDICTIONS.some((p) => p.assetId === a.id))!;
const withoutPreds = ASSETS.find((a) => !PREDICTIONS.some((p) => p.assetId === a.id));

beforeEach(() => {
  nav.id = withPreds.id;
  receipts.record.mockReset();
  useMarket.getState().reset();
  useMarket.setState({ toasts: [], feed: [] });
});

describe("Asset page", () => {
  it("shows a not-listed state with the three most-traded titles and a link to all markets", () => {
    nav.id = "does-not-exist";
    render(<AssetPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Asset not listed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse all markets" })).toHaveAttribute("href", "/markets");
    const markets = useMarket.getState().markets;
    const top = [...ASSETS].sort((a, b) => markets[b.id].volume24h - markets[a.id].volume24h).slice(0, 3);
    const list = screen.getByRole("heading", { name: "Most traded right now" }).nextElementSibling as HTMLElement;
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(top.map((a) => `/asset/${a.id}`));
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  });

  it("labels the session EPI as simulated and the headline metric's source", () => {
    render(<AssetPage />);
    const header = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
    expect(header).toHaveTextContent(/EPI · this session[\d.]+simulated/);
    expect(header).toHaveTextContent(`${withPreds.metric.label}`);
    expect(header).toHaveTextContent(/TMDB/);
  });

  it("puts this title's latest news on the oracle wire, with the NEAR report for that news linked", () => {
    const st = useMarket.getState();
    const m = st.markets[withPreds.id];
    useMarket.setState({
      markets: {
        ...st.markets,
        [withPreds.id]: { ...m, lastNews: { id: "n1", ts: Date.now(), text: "Trailer crosses 60M views · App EPI 80.0 → 85.0", tx: "abc" } },
      },
      // The shared feed has long since dropped it: the wire must not depend on the feed.
      feed: [],
    });
    render(<AssetPage />);
    const wire = screen.getByText("Oracle wire").closest(".wire") as HTMLElement;
    expect(within(wire).getByRole("status")).toHaveTextContent("Trailer crosses 60M views · App EPI 80.0 → 85.0");
    // The timestamp sits outside the live region, so it isn't re-announced as it ticks.
    expect(within(wire).getByRole("status")).not.toHaveTextContent("ago");
    expect(within(wire).getByRole("link", { name: /Signed on NEAR/ })).toHaveAttribute("href", expect.stringContaining("abc"));
  });

  it("leaves the NEAR link off news whose own report hasn't landed", () => {
    const st = useMarket.getState();
    const m = st.markets[withPreds.id];
    useMarket.setState({
      markets: { ...st.markets, [withPreds.id]: { ...m, oracleTx: "older", lastNews: { id: "n2", ts: Date.now(), text: "Reviews disappoint" } } },
    });
    render(<AssetPage />);
    const wire = screen.getByText("Oracle wire").closest(".wire") as HTMLElement;
    expect(wire).toHaveTextContent("Reviews disappoint");
    expect(within(wire).queryByRole("link", { name: /Signed on NEAR/ })).not.toBeInTheDocument();
  });

  it("says plainly when there is no news on the title yet", () => {
    render(<AssetPage />);
    expect(screen.getByText("Oracle wire").closest(".wire")).toHaveTextContent(`No news on ${withPreds.ticker} this session`);
  });

  it("shows the oracle EPI from NEAR with its gap to the session EPI", async () => {
    const m = useMarket.getState().markets[withPreds.id];
    const oracle = Math.round(m.epi * 10) / 10 + 6;
    const result = Array.from(new TextEncoder().encode(JSON.stringify({ epi_x10: Math.round(oracle * 10) })));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ result: { result } })));
    render(<AssetPage />);
    const link = await screen.findByRole("link", { name: /oracle report/ });
    expect(link).toHaveTextContent(oracle.toFixed(1));
    expect(screen.getByText(/Session is \d+\.\d lower/)).toBeInTheDocument();
    expect(screen.getByText(/the NEAR value is the last report the trusted/)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("says when the NEAR read fails instead of reading forever", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("429"));
    render(<AssetPage />);
    expect(await screen.findByText("Unavailable right now")).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("explains the two EPI readings even when they match", async () => {
    const m = useMarket.getState().markets[withPreds.id];
    const result = Array.from(new TextEncoder().encode(JSON.stringify({ epi_x10: Math.round(m.epi * 10) })));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ result: { result } })));
    render(<AssetPage />);
    expect(await screen.findByText("Session matches NEAR")).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows 'Not released yet' instead of a zero metric for an upcoming title", () => {
    const upcoming = ASSETS.find((a) => a.metric.value === 0 && new Date(a.releaseDate).getTime() > Date.now());
    if (!upcoming) return;
    nav.id = upcoming.id;
    render(<AssetPage />);
    const header = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
    expect(header).toHaveTextContent("Not released yet");
  });

  it("renders the header with title, ticker, price, EPI and volume from the store", () => {
    render(<AssetPage />);
    const a = withPreds;
    const m = useMarket.getState().markets[a.id];
    expect(screen.getByRole("heading", { level: 1, name: a.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Discover/ })).toHaveAttribute("href", "/markets");
    const header = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
    expect(header).toHaveTextContent(a.ticker);
    expect(header).toHaveTextContent(a.tagline);
    expect(header).toHaveTextContent(usd(priceOf(m)));
    expect(header).toHaveTextContent(m.epi.toFixed(1));
    expect(header).toHaveTextContent(compactUsd(m.volume24h));
    expect(header).toHaveTextContent(a.metric.label);
    expect(header).toHaveTextContent("Next catalyst");
  });

  it("renders chart, trade ticket, order book, signals and activity", () => {
    render(<AssetPage />);
    const a = withPreds;
    expect(screen.getByTestId("price-chart")).toHaveTextContent(`${a.id}:15`);
    expect(screen.getByRole("heading", { name: `${a.ticker} / USD` })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: `Trade ${a.ticker}` })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Market depth" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Signals behind the price" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `Activity on ${a.ticker}` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Trade ${a.ticker}` })).toHaveAttribute("href", "#trade");
  });

  it("switches candle size between 15s and 1m", async () => {
    const user = userEvent.setup();
    render(<AssetPage />);
    const group = screen.getByRole("group", { name: "Candle size" });
    const s15 = within(group).getByRole("button", { name: "15s" });
    const m1 = within(group).getByRole("button", { name: "1m" });
    expect(s15).toHaveAttribute("aria-pressed", "true");
    await user.click(m1);
    expect(m1).toHaveAttribute("aria-pressed", "true");
    expect(s15).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("price-chart")).toHaveTextContent(`${withPreds.id}:60`);
  });

  it("lists related prediction markets for the title", () => {
    render(<AssetPage />);
    const related = PREDICTIONS.filter((p) => p.assetId === withPreds.id);
    expect(screen.getByRole("heading", { name: `Prediction markets on ${withPreds.ticker}` })).toBeInTheDocument();
    for (const p of related) {
      expect(screen.getByRole("link", { name: p.question })).toHaveAttribute("href", `/predictions/${p.id}`);
    }
  });

  it.skipIf(!withoutPreds)("omits the prediction section when a title has none", () => {
    nav.id = withoutPreds!.id;
    render(<AssetPage />);
    expect(screen.queryByRole("heading", { name: /^Prediction markets on/ })).not.toBeInTheDocument();
  });

  it("shows 'Your position' only once the user holds units", () => {
    render(<AssetPage />);
    expect(screen.queryByRole("heading", { name: "Your position" })).not.toBeInTheDocument();
    act(() => {
      useMarket.getState().buy(withPreds.id, 4);
    });
    const panel = screen.getByRole("heading", { name: "Your position" }).closest(".panel") as HTMLElement;
    const s = useMarket.getState();
    const h = s.holdings[withPreds.id];
    const value = h.units * priceOf(s.markets[withPreds.id]);
    expect(panel).toHaveTextContent("Units4");
    expect(panel).toHaveTextContent(usd(h.cost / h.units));
    expect(panel).toHaveTextContent(usd(value));
    const pnl = value - h.cost;
    expect(panel).toHaveTextContent(`${pnl >= 0 ? "+" : ""}${usd(pnl)}`);
    // The activity feed for this title picks up the trade.
    const activity = screen.getByRole("heading", { name: `Activity on ${withPreds.ticker}` }).closest(".panel")!;
    expect(activity).toHaveTextContent(`You bought 4 ${withPreds.ticker}`);
  });

  it("buying through the trade ticket updates the store and the page", async () => {
    const user = userEvent.setup();
    render(<AssetPage />);
    const ticket = screen.getByRole("complementary", { name: `Trade ${withPreds.ticker}` });
    await user.click(within(ticket).getByRole("button", { name: new RegExp(`^Buy [\\d.]+ ${withPreds.ticker} · \\$`) }));
    expect(useMarket.getState().holdings[withPreds.id]).toBeDefined();
    const trade = useMarket.getState().trades[0];
    expect(trade.kind).toBe("BUY");
    expect(trade.total).toBeLessThanOrEqual(25);
    expect(useMarket.getState().cash).toBeCloseTo(1000 - trade.total, 6);
    // No wallet connected (receipts.any = false), so no on-chain receipt is attempted.
    expect(receipts.record).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Your position" })).toBeInTheDocument();
  });

  it("re-renders when navigating to another asset id", () => {
    const other = ASSETS.find((a) => a.id !== withPreds.id)!;
    const { rerender } = render(<AssetPage />);
    nav.id = other.id;
    rerender(<AssetPage />);
    expect(screen.getByRole("heading", { level: 1, name: other.title })).toBeInTheDocument();
  });
});
