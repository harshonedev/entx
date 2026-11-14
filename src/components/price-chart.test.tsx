import { act, render, screen } from "@testing-library/react";
import { ASSETS } from "@/lib/assets";
import type { Candle } from "@/lib/engine";
import { useMarket, type FeedItem } from "@/store/market";
import { PriceChart } from "./price-chart";

const lc = vi.hoisted(() => {
  const series = { setData: vi.fn(), update: vi.fn() };
  const timeScale = { fitContent: vi.fn() };
  const chart = { addSeries: vi.fn(() => series), timeScale: vi.fn(() => timeScale), remove: vi.fn() };
  const markers = { setMarkers: vi.fn() };
  return {
    series,
    timeScale,
    chart,
    markers,
    createChart: vi.fn(() => chart),
    createSeriesMarkers: vi.fn(() => markers),
  };
});

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "Candlestick",
  ColorType: { Solid: "solid" },
  createChart: lc.createChart,
  createSeriesMarkers: lc.createSeriesMarkers,
}));

const initial = useMarket.getState();
const asset = ASSETS[0];
const T0 = 1_800_000_000; // multiple of 60

function candles(n: number, start = T0): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 15,
    open: 10 + i,
    high: 12 + i,
    low: 9 + i,
    close: 11 + i,
  }));
}

function setCandles(list: Candle[]) {
  const s = useMarket.getState();
  useMarket.setState({ candles: { ...s.candles, [asset.id]: list } });
}

function feedItem(p: Partial<FeedItem>): FeedItem {
  return { id: Math.random().toString(36), ts: (T0 + 20) * 1000, type: "oracle", text: "x", tone: "up", refId: asset.id, ...p };
}

beforeEach(() => {
  useMarket.setState(initial, true);
  for (const f of [lc.series.setData, lc.series.update, lc.timeScale.fitContent, lc.chart.addSeries, lc.chart.remove, lc.markers.setMarkers, lc.createChart, lc.createSeriesMarkers]) {
    f.mockClear();
  }
});

describe("PriceChart", () => {
  it("creates a candlestick chart at the requested height", () => {
    render(<PriceChart assetId={asset.id} height={200} />);
    const img = screen.getByRole("img");
    expect(img).toHaveStyle({ height: "200px" });
    expect(lc.createChart).toHaveBeenCalledWith(img, expect.objectContaining({ height: 200, autoSize: true }));
    expect(lc.chart.addSeries).toHaveBeenCalledWith("Candlestick", expect.any(Object));
    expect(lc.createSeriesMarkers).toHaveBeenCalledWith(lc.series, []);
  });

  it("does not push data until candles exist, and labels the empty state", () => {
    render(<PriceChart assetId={asset.id} />);
    expect(lc.series.setData).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAccessibleName("Price chart. No news events or trades in this window yet.");
  });

  it("sets the full series once, then streams single-candle updates", () => {
    setCandles(candles(10));
    render(<PriceChart assetId={asset.id} />);
    expect(lc.series.setData).toHaveBeenCalledTimes(1);
    expect(lc.series.setData.mock.calls[0][0]).toHaveLength(10);
    expect(lc.timeScale.fitContent).toHaveBeenCalledTimes(1);

    act(() => setCandles(candles(11)));
    expect(lc.series.update).toHaveBeenCalledTimes(1);
    expect(lc.series.update).toHaveBeenCalledWith(expect.objectContaining({ time: T0 + 10 * 15, close: 21 }));
    expect(lc.series.setData).toHaveBeenCalledTimes(1);

    // A big jump (e.g. a reset) re-sets the whole series.
    act(() => setCandles(candles(3)));
    expect(lc.series.setData).toHaveBeenCalledTimes(2);
  });

  it("aggregates candles into wider buckets when step > 15s", () => {
    setCandles(candles(8)); // 8 x 15s = two 60s buckets
    render(<PriceChart assetId={asset.id} step={60} />);
    const data = lc.series.setData.mock.calls[0][0] as Candle[];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ time: T0, open: 10, high: 15, low: 9, close: 14 });
    expect(data[1]).toEqual({ time: T0 + 60, open: 14, high: 19, low: 13, close: 18 });
    expect(lc.createChart).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeScale: expect.objectContaining({ secondsVisible: false }) }),
    );
  });

  it("does not mutate the store's candles when aggregating", () => {
    const list = candles(8);
    setCandles(list);
    render(<PriceChart assetId={asset.id} step={60} />);
    expect(useMarket.getState().candles[asset.id]).toEqual(candles(8));
  });

  it("marks this asset's news and trades, and describes them in the label", () => {
    setCandles(candles(10));
    useMarket.setState({
      feed: [
        feedItem({ type: "oracle", tone: "up", tag: "Trailer goes viral" }),
        feedItem({ type: "oracle", tone: "down", tag: "Reviews disappoint", ts: (T0 + 50) * 1000 }),
        feedItem({ type: "trade", tone: "up" }),
        feedItem({ type: "bot", tone: "up" }), // ignored type
        feedItem({ type: "oracle", refId: "other-asset" }), // other asset
        feedItem({ type: "oracle", ts: (T0 - 600) * 1000 }), // before first candle
      ],
    });
    render(<PriceChart assetId={asset.id} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Price chart. Marked: 2 news events, 1 of your trades.");

    const markers = lc.markers.setMarkers.mock.calls.at(-1)![0] as { shape: string; text: string; position: string; time: number }[];
    expect(markers).toHaveLength(3);
    expect(markers.map((m) => m.time)).toEqual([...markers.map((m) => m.time)].sort((a, b) => a - b));
    expect(markers).toContainEqual(expect.objectContaining({ shape: "arrowUp", position: "belowBar", text: "Trailer goes viral" }));
    expect(markers).toContainEqual(expect.objectContaining({ shape: "arrowDown", position: "aboveBar", text: "Reviews disappoint" }));
    expect(markers).toContainEqual(expect.objectContaining({ shape: "circle", text: "" }));
  });

  it("uses singular wording for a single event", () => {
    setCandles(candles(10));
    useMarket.setState({ feed: [feedItem({ type: "oracle" })] });
    render(<PriceChart assetId={asset.id} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Price chart. Marked: 1 news event, 0 of your trades.");
  });

  it("removes the chart on unmount and recreates it when the asset changes", () => {
    const { rerender, unmount } = render(<PriceChart assetId={asset.id} />);
    expect(lc.createChart).toHaveBeenCalledTimes(1);
    rerender(<PriceChart assetId={ASSETS[1].id} />);
    expect(lc.chart.remove).toHaveBeenCalledTimes(1);
    expect(lc.createChart).toHaveBeenCalledTimes(2);
    unmount();
    expect(lc.chart.remove).toHaveBeenCalledTimes(2);
  });
});
