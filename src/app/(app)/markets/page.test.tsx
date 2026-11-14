import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssetSeed } from "@/lib/assets";
import { ASSETS } from "@/lib/assets";
import { change24h, priceOf, useMarket } from "@/store/market";

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
  AssetTable: ({ assets, limit }: { assets: AssetSeed[]; limit?: number }) => (
    <ol data-testid="asset-table">
      {(limit == null ? assets : assets.slice(0, limit)).map((a) => (
        <li key={a.id}>{a.id}</li>
      ))}
    </ol>
  ),
}));
vi.mock("@/components/release-clock", () => ({ ReleaseClock: () => <div data-testid="release-clock" /> }));

import Discover from "./page";
import { NEAR_CONTRACT } from "@/lib/near-config";

const rpc = (v: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: "entx", result: { result: Array.from(new TextEncoder().encode(JSON.stringify(v))) } }));

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
    for (const h of ["Markets", "Market activity", "Top gainers", "Top losers"]) {
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

  it("hero CTA trades the highest-EPI title in theaters", () => {
    render(<Discover />);
    const m = useMarket.getState().markets;
    const spot = ASSETS.filter((a) => a.status === "In theaters").sort((a, b) => m[b.id].epi - m[a.id].epi)[0];
    expect(screen.getByRole("link", { name: new RegExp(`^Trade ${spot.title}`) })).toHaveAttribute(
      "href",
      `/asset/${spot.id}`,
    );
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

  it("hero CTA fires a news event on the hero title and opens its chart", async () => {
    const user = userEvent.setup();
    render(<Discover />);
    const m = useMarket.getState().markets;
    const spot = ASSETS.filter((a) => a.status === "In theaters").sort((a, b) => m[b.id].epi - m[a.id].epi)[0];
    await user.click(screen.getByRole("button", { name: `Watch news move ${spot.title}` }));
    expect(nav.push).toHaveBeenCalledWith(`/asset/${spot.id}`);
    expect(useMarket.getState().feed[0]).toMatchObject({ type: "oracle", refId: spot.id });
    expect(panelOf("Market activity")).toHaveTextContent(/NEWS/);
  });

  it("leads with a live NEAR proof strip read from the contract", async () => {
    // Registry: 3 titles the app lists plus 2 legacy markets it no longer does.
    const market = (id: string) => ({
      id,
      kind: "Asset",
      title: id,
      ticker: id.slice(0, 5).toUpperCase(),
      epi_x10: 500,
      status: "Open",
      created_at_ms: 0,
      trades: 0,
      volume_micro_usd: 0,
      oracle_updates: 0,
    });
    const registry = [...ASSETS.slice(0, 3).map((a) => market(a.id)), market("legacy-1"), market("legacy-2")];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const method = JSON.parse(String(init.body)).params.method_name;
        if (method === "get_stats")
          return rpc({ owner: NEAR_CONTRACT, markets: 45, receipts: 0, epi_reports: 23, total_staked: "0" });
        if (method === "get_markets") return rpc(registry);
        return rpc([NEAR_CONTRACT, "oracle.testnet"]);
      }),
    );
    render(<Discover />);
    const strip = screen.getByRole("region", { name: "Live on NEAR testnet" });
    expect(within(strip).getByRole("link", { name: new RegExp(NEAR_CONTRACT) })).toHaveAttribute(
      "href",
      `https://testnet.nearblocks.io/address/${NEAR_CONTRACT}`,
    );
    expect(within(strip).getByRole("status")).toHaveTextContent("Reading contract…");
    expect(await within(strip).findByText(/oracle EPI reports/)).toHaveTextContent("23 oracle EPI reports");
    expect(strip).toHaveTextContent("45 markets registered on NEAR (3 listed in app)");
    expect(within(strip).getByRole("link", { name: /Trusted oracle/ })).toHaveAttribute(
      "href",
      "https://testnet.nearblocks.io/address/oracle.testnet",
    );
    expect(within(strip).getByRole("link", { name: /Verify on-chain/ })).toHaveAttribute("href", "/onchain");
  });

  it("proof strip says counts are unavailable when the RPC fails, never showing made-up numbers", async () => {
    render(<Discover />);
    const strip = screen.getByRole("region", { name: "Live on NEAR testnet" });
    expect(await within(strip).findByText(/live counts are unavailable/)).toBeInTheDocument();
    expect(strip).not.toHaveTextContent(/\d+ oracle EPI reports/);
  });

  it("only shows the live marker once the activity feed has events", () => {
    render(<Discover />);
    const feed = panelOf("Market activity");
    expect(within(feed).queryByText("Live")).toBeNull();
    act(() => {
      useMarket.getState().buy(ASSETS[0].id, 1);
    });
    expect(within(feed).getByText("Live")).toBeInTheDocument();
  });
});
