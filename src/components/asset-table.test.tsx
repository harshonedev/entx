import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { compactUsd, usd } from "@/lib/format";
import { priceOf, useMarket } from "@/store/market";
import { AssetTable } from "./asset-table";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));

const initial = useMarket.getState();
const assets = ASSETS.slice(0, 3);

beforeEach(() => {
  useMarket.setState(initial, true);
  push.mockClear();
});

const table = () => screen.getByRole("table");
const bodyRows = () => within(within(table()).getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("AssetTable", () => {
  it("renders one table row and one mobile list item per asset", () => {
    render(<AssetTable assets={assets} />);
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows ticker, price, EPI and volume from the store", () => {
    render(<AssetTable assets={assets} />);
    const a = assets[0];
    const m = initial.markets[a.id];
    const row = bodyRows()[0];
    expect(row).toHaveTextContent(a.title);
    expect(row).toHaveTextContent(a.ticker);
    expect(row).toHaveTextContent(a.kind === "movie" ? "Movie" : "Show");
    expect(row).toHaveTextContent(usd(priceOf(m)));
    expect(row).toHaveTextContent(m.epi.toFixed(1));
    expect(row).toHaveTextContent(compactUsd(m.volume24h));
  });

  it("links each asset to its detail page", () => {
    render(<AssetTable assets={assets} />);
    for (const a of assets) {
      const links = screen.getAllByRole("link", { name: new RegExp(a.title) });
      expect(links.length).toBeGreaterThanOrEqual(2);
      for (const l of links) expect(l).toHaveAttribute("href", `/asset/${a.id}`);
    }
  });

  it("navigates via router when a table row is clicked", async () => {
    render(<AssetTable assets={assets} />);
    await userEvent.click(within(bodyRows()[1]).getAllByRole("cell")[1]);
    expect(push).toHaveBeenCalledWith(`/asset/${assets[1].id}`);
  });

  it("does not double-navigate through the router when the inner link is clicked", async () => {
    render(<AssetTable assets={assets} />);
    const link = within(bodyRows()[0]).getByRole("link");
    await userEvent.click(link);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the Signal column only when showMetric is on", () => {
    const { unmount } = render(<AssetTable assets={assets} />);
    expect(within(table()).getByRole("columnheader", { name: "Signal" })).toBeInTheDocument();
    expect(bodyRows()[0]).toHaveTextContent(assets[0].metric.label);
    unmount();
    render(<AssetTable assets={assets} showMetric={false} />);
    expect(within(table()).queryByRole("columnheader", { name: "Signal" })).toBeNull();
    expect(within(table()).getAllByRole("columnheader")).toHaveLength(7);
  });

  it("draws a trend sparkline only once candle history exists", () => {
    const { container } = render(<AssetTable assets={assets} />);
    expect(container.querySelectorAll("tbody svg")).toHaveLength(0);
    act(() => useMarket.getState().ensureHistory());
    expect(container.querySelectorAll("tbody svg path")).toHaveLength(3);
  });

  it("reflects live price updates from the store", () => {
    render(<AssetTable assets={assets} />);
    const a = assets[0];
    act(() => {
      const s = useMarket.getState();
      const m = s.markets[a.id];
      useMarket.setState({ markets: { ...s.markets, [a.id]: { ...m, pool: { cash: m.pool.units * 42.5, units: m.pool.units } } } });
    });
    expect(bodyRows()[0]).toHaveTextContent("$42.50");
  });

  it("keeps the given order until a column is sorted", () => {
    render(<AssetTable assets={assets} />);
    expect(bodyRows().map((r) => r.textContent)).toEqual(
      assets.map((a) => expect.stringContaining(a.title) as unknown as string),
    );
    for (const name of [/Price/, /24h/, /EPI/, /Volume/]) {
      expect(within(table()).getByRole("columnheader", { name })).toHaveAttribute("aria-sort", "none");
    }
  });

  it("sorts by a column header: high to low, low to high, then back to default", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={assets} />);
    const epi = (id: string) => initial.markets[id].epi;
    const byEpi = [...assets].sort((a, b) => epi(b.id) - epi(a.id)).map((a) => a.title);
    const titles = () => bodyRows().map((r) => assets.find((a) => r.textContent?.includes(a.title))!.title);
    const header = () => within(table()).getByRole("columnheader", { name: /EPI/ });
    const button = within(header()).getByRole("button", { name: /EPI/ });

    await user.click(button);
    expect(header()).toHaveAttribute("aria-sort", "descending");
    expect(titles()).toEqual(byEpi);

    await user.click(button);
    expect(header()).toHaveAttribute("aria-sort", "ascending");
    expect(titles()).toEqual([...byEpi].reverse());

    await user.click(button);
    expect(header()).toHaveAttribute("aria-sort", "none");
    expect(titles()).toEqual(assets.map((a) => a.title));
  });

  it("sort headers are keyboard operable", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={assets} />);
    within(table()).getByRole("button", { name: /Volume/ }).focus();
    await user.keyboard("{Enter}");
    expect(within(table()).getByRole("columnheader", { name: /Volume/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts the mobile list from the select and applies limit after sorting", async () => {
    const user = userEvent.setup();
    const all = ASSETS.slice(0, 6);
    render(<AssetTable assets={all} limit={2} />);
    expect(bodyRows()).toHaveLength(2);
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "volume:desc");
    const vol = (id: string) => initial.markets[id].volume24h;
    const top2 = [...all].sort((a, b) => vol(b.id) - vol(a.id)).slice(0, 2);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    top2.forEach((a, i) => expect(items[i]).toHaveTextContent(a.title));
    expect(within(table()).getByRole("columnheader", { name: /Volume/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("renders an empty table for no assets", () => {
    render(<AssetTable assets={[]} />);
    expect(within(table()).getAllByRole("rowgroup")[1]).toBeEmptyDOMElement();
  });
});
