import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssetSeed } from "@/lib/assets";
import { ASSETS } from "@/lib/assets";
import { change24h, priceOf, useMarket } from "@/store/market";
import { usd } from "@/lib/format";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={String(props.src)} />,
}));
// The table itself has its own tests; here we only care which assets the page hands it, in which order.
vi.mock("@/components/asset-table", () => ({
  AssetTable: ({ assets }: { assets: AssetSeed[] }) => (
    <ol data-testid="asset-table">
      {assets.map((a) => (
        <li key={a.id}>{a.id}</li>
      ))}
    </ol>
  ),
}));
vi.mock("@/components/release-clock", () => ({ ReleaseClock: () => <div data-testid="release-clock" /> }));

import Discover from "./page";

const rows = () =>
  within(screen.getByTestId("asset-table"))
    .queryAllByRole("listitem")
    .map((li) => li.textContent);

const panelOf = (heading: string) => screen.getByRole("heading", { name: heading }).closest(".panel") as HTMLElement;

const byVolume = () => {
  const m = useMarket.getState().markets;
  return [...ASSETS].sort((a, b) => m[b.id].volume24h - m[a.id].volume24h);
};

beforeEach(() => {
  nav.push.mockReset();
  useMarket.getState().reset();
  useMarket.setState({ toasts: [], feed: [] });
  // publishToNear (fired by randomOracle) posts to /api/oracle; keep it off the network.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "offline" }), { status: 500 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Discover page", () => {
  it("renders the intro, release calendar, markets, activity and movers sections", () => {
    render(<Discover />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Entertainment, now tradable.");
    expect(screen.getByText("Hackathon demo")).toBeInTheDocument();
    expect(screen.getByTestId("release-clock")).toBeInTheDocument();
    for (const h of ["Markets", "Market activity", "Spotlight", "Top gainers", "Top losers"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
  });

  it("defaults to 'Most traded': top 10 by 24h volume with a show-all toggle", async () => {
    const user = userEvent.setup();
    render(<Discover />);
    expect(screen.getByRole("button", { name: "Most traded" })).toHaveAttribute("aria-pressed", "true");
    const expected = byVolume().map((a) => a.id);
    expect(rows()).toEqual(expected.slice(0, 10));

    const toggle = screen.getByRole("button", { name: `Show all ${ASSETS.length} titles` });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(rows()).toEqual(expected);
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    await user.click(fewer);
    expect(rows()).toHaveLength(10);
  });

  it("filters by Movies and Shows, keeping volume order", async () => {
    const user = userEvent.setup();
    render(<Discover />);
    const movies = byVolume().filter((a) => a.kind === "movie");
    const shows = byVolume().filter((a) => a.kind === "show");

    await user.click(screen.getByRole("button", { name: "Movies" }));
    expect(screen.getByRole("button", { name: "Movies" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Most traded" })).toHaveAttribute("aria-pressed", "false");
    expect(rows()).toEqual(movies.slice(0, 10).map((a) => a.id));
    if (movies.length > 10) {
      await user.click(screen.getByRole("button", { name: `Show all ${movies.length} titles` }));
      expect(rows()).toEqual(movies.map((a) => a.id));
    }

    // Switching tab collapses the expanded list again.
    await user.click(screen.getByRole("button", { name: "Shows" }));
    expect(rows()).toEqual(shows.slice(0, 10).map((a) => a.id));
    expect(rows().every((id) => ASSETS.find((a) => a.id === id)!.kind === "show")).toBe(true);
    if (shows.length <= 10) expect(screen.queryByRole("button", { name: /^Show all/ })).not.toBeInTheDocument();
  });

  it("'Recently listed' shows titles listed within 7 days, newest first", async () => {
    const user = userEvent.setup();
    render(<Discover />);
    await user.click(screen.getByRole("button", { name: "Recently listed" }));
    const expected = ASSETS.filter((a) => a.listedDaysAgo <= 7)
      .sort((a, b) => a.listedDaysAgo - b.listedDaysAgo)
      .map((a) => a.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(rows()).toEqual(expected.slice(0, 10));
    const days = rows().map((id) => ASSETS.find((a) => a.id === id)!.listedDaysAgo);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it("spotlights the highest-EPI title in theaters and links to it", () => {
    render(<Discover />);
    const m = useMarket.getState().markets;
    const spot = ASSETS.filter((a) => a.status === "In theaters").sort((a, b) => m[b.id].epi - m[a.id].epi)[0];
    const card = panelOf("Spotlight");
    expect(card).toHaveAttribute("href", `/asset/${spot.id}`);
    expect(within(card).getByText(spot.title)).toBeInTheDocument();
    expect(card).toHaveTextContent(usd(priceOf(m[spot.id])));
    expect(within(card).getByText(m[spot.id].epi.toFixed(1))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(`^Trade ${spot.title}`) })).toHaveAttribute(
      "href",
      `/asset/${spot.id}`,
    );
  });

  it("spotlight follows EPI changes in the store", () => {
    render(<Discover />);
    const theaters = ASSETS.filter((a) => a.status === "In theaters");
    const target = theaters[theaters.length - 1];
    act(() => {
      const s = useMarket.getState();
      useMarket.setState({ markets: { ...s.markets, [target.id]: { ...s.markets[target.id], epi: 999 } } });
    });
    expect(panelOf("Spotlight")).toHaveAttribute("href", `/asset/${target.id}`);
  });

  it("lists top gainers and losers (max 4) sorted by 24h change, linking to assets", () => {
    render(<Discover />);
    const m = useMarket.getState().markets;
    const byChange = [...ASSETS].sort((a, b) => change24h(m[b.id]) - change24h(m[a.id]));
    const gainers = byChange.filter((a) => change24h(m[a.id]) > 0).slice(0, 4);
    const losers = byChange
      .filter((a) => change24h(m[a.id]) < 0)
      .reverse()
      .slice(0, 4);

    const g = within(panelOf("Top gainers")).getAllByRole("link");
    expect(g.map((l) => l.getAttribute("href"))).toEqual(gainers.map((a) => `/asset/${a.id}`));
    const l = within(panelOf("Top losers")).queryAllByRole("link");
    expect(l.map((x) => x.getAttribute("href"))).toEqual(losers.map((a) => `/asset/${a.id}`));
    expect(g.length).toBeLessThanOrEqual(4);
  });

  it("shows empty mover states on a flat day", () => {
    const s = useMarket.getState();
    const flat = Object.fromEntries(
      Object.entries(s.markets).map(([id, m]) => [id, { ...m, ref24h: priceOf(m) }]),
    );
    useMarket.setState({ markets: flat });
    render(<Discover />);
    expect(within(panelOf("Top gainers")).getByText("Nothing is up today.")).toBeInTheDocument();
    expect(within(panelOf("Top losers")).getByText("Nothing is down today.")).toBeInTheDocument();
    expect(within(panelOf("Top gainers")).queryAllByRole("link")).toHaveLength(0);
  });

  it("market activity shows the empty feed, then store events", () => {
    render(<Discover />);
    const feed = panelOf("Market activity");
    expect(feed).toHaveTextContent(/No activity yet/);
    const a = ASSETS[0];
    act(() => {
      useMarket.getState().buy(a.id, 1);
    });
    expect(feed).toHaveTextContent(`You bought 1 ${a.ticker}`);
  });

  it("'Simulate a news event' fires an oracle update and navigates to that asset", async () => {
    const user = userEvent.setup();
    render(<Discover />);
    await user.click(screen.getByRole("button", { name: /Simulate a news event/ }));
    expect(nav.push).toHaveBeenCalledTimes(1);
    const href = nav.push.mock.calls[0][0] as string;
    expect(href).toMatch(/^\/asset\//);
    const id = href.slice("/asset/".length);
    expect(ASSETS.some((a) => a.id === id)).toBe(true);
    const item = useMarket.getState().feed[0];
    expect(item).toMatchObject({ type: "oracle", refId: id });
    expect(panelOf("Market activity")).toHaveTextContent(/ORACLE/);
  });
});
