import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { priceOf, useMarket, type FeedItem } from "@/store/market";
import { usd } from "@/lib/format";
import { LiveFeed, TickerTape, Toasts } from "./chrome";

const initial = useMarket.getState();
beforeEach(() => useMarket.setState(initial, true));

const item = (o: Partial<FeedItem>): FeedItem => ({
  id: Math.random().toString(36).slice(2),
  ts: Date.now(),
  type: "bot",
  text: "x",
  tone: "neutral",
  ...o,
});

describe("TickerTape", () => {
  it("lists every asset with ticker, price and link", () => {
    render(<TickerTape />);
    const nav = screen.getByRole("navigation", { name: "Market prices" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(ASSETS.length);
    const a = ASSETS[0];
    const link = links[0];
    expect(link).toHaveAttribute("href", `/asset/${a.id}`);
    expect(link).toHaveTextContent(a.ticker);
    expect(link).toHaveTextContent(usd(priceOf(useMarket.getState().markets[a.id])));
  });

  it("shows each title and is a single Tab stop with arrow-key navigation", async () => {
    const user = userEvent.setup();
    render(<TickerTape />);
    const links = within(screen.getByRole("navigation", { name: "Market prices" })).getAllByRole("link");
    expect(links[0]).toHaveTextContent(ASSETS[0].title);
    expect(links[0]).toHaveAttribute("title", ASSETS[0].title);
    expect(links.filter((l) => l.getAttribute("tabindex") === "0")).toHaveLength(1);

    await user.tab();
    expect(links[0]).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(links[2]).toHaveFocus();
    expect(links[2]).toHaveAttribute("tabindex", "0");
    expect(links[0]).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{ArrowLeft}");
    expect(links[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(links[links.length - 1]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(links[0]).toHaveFocus();
  });

  it("updates prices when the store changes", () => {
    render(<TickerTape />);
    const a = ASSETS[0];
    const m = useMarket.getState().markets[a.id];
    act(() => {
      useMarket.setState({
        markets: { ...useMarket.getState().markets, [a.id]: { ...m, pool: { cash: 1234.5 * 1000, units: 1000 } } },
      });
    });
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("$1,234.50");
  });
});

describe("Toasts", () => {
  it("renders nothing visible without toasts but keeps a live region", () => {
    render(<Toasts />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
  });

  it("renders title, body and internal/external links", () => {
    useMarket.setState({
      toasts: [
        { id: "a", title: "Bought 1 X", body: "details", tone: "up", href: "/portfolio" },
        { id: "b", title: "On chain", tone: "neutral", href: "https://example.com/tx" },
        { id: "c", title: "Plain", tone: "down" },
      ],
    });
    render(<Toasts />);
    expect(screen.getByText("details")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bought 1 X/ })).toHaveAttribute("href", "/portfolio");
    const ext = screen.getByRole("link", { name: /On chain/ });
    expect(ext).toHaveAttribute("href", "https://example.com/tx");
    expect(ext).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Plain").closest("a")).toBeNull();
  });

  it("dismisses a toast", async () => {
    useMarket.setState({
      toasts: [
        { id: "a", title: "First", tone: "up" },
        { id: "b", title: "Second", tone: "up" },
      ],
    });
    const user = userEvent.setup();
    render(<Toasts />);
    await user.click(screen.getAllByRole("button", { name: "Dismiss" })[0]);
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(useMarket.getState().toasts.map((t) => t.id)).toEqual(["b"]);
  });

  it("shows toasts pushed by store actions and auto-dismisses them", () => {
    vi.useFakeTimers();
    try {
      render(<Toasts />);
      act(() => useMarket.getState().toast({ title: "Hello", tone: "neutral" }));
      expect(screen.getByText("Hello")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(5200));
      expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("LiveFeed", () => {
  it("shows the empty message", () => {
    render(<LiveFeed empty="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("shows the default empty message", () => {
    render(<LiveFeed />);
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument();
  });

  it("lists all items up to the limit, linking asset items", () => {
    const a = ASSETS[0];
    useMarket.setState({
      feed: [
        item({ text: "one", refId: a.id }),
        item({ text: "two" }),
        item({ text: "three" }),
      ],
    });
    render(<LiveFeed limit={2} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "one" })).toHaveAttribute("href", `/asset/${a.id}`);
    expect(screen.getByText("two")).toBeInTheDocument();
    expect(screen.queryByText("three")).not.toBeInTheDocument();
  });

  it("filters by refId and does not link to the asset page", () => {
    const [a, b] = ASSETS;
    useMarket.setState({ feed: [item({ text: "mine", refId: a.id }), item({ text: "theirs", refId: b.id })] });
    render(<LiveFeed refId={a.id} />);
    expect(screen.getByText("mine")).toBeInTheDocument();
    expect(screen.getByText("mine").closest("a")).toBeNull();
    expect(screen.queryByText("theirs")).not.toBeInTheDocument();
  });

  it("filters by any of refIds", () => {
    useMarket.setState({
      feed: [item({ text: "p", refId: "pred" }), item({ text: "a", refId: "asset" }), item({ text: "z", refId: "zzz" })],
    });
    render(<LiveFeed refIds={["pred", "asset"]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("z")).not.toBeInTheDocument();
  });

  it("renders external hrefs as new-tab links", () => {
    useMarket.setState({ feed: [item({ text: "published", href: "https://nearblocks.io/tx/1", type: "chain" })] });
    render(<LiveFeed />);
    const link = screen.getByRole("link", { name: "published ↗" });
    expect(link).toHaveAttribute("href", "https://nearblocks.io/tx/1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows relative timestamps", () => {
    useMarket.setState({ feed: [item({ text: "old", ts: Date.now() - 5 * 60_000 })] });
    render(<LiveFeed />);
    expect(screen.getByText("5m ago")).toBeInTheDocument();
  });
});
