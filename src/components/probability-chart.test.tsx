import { act, render, screen } from "@testing-library/react";
import { PREDICTIONS } from "@/lib/predictions";
import { useMarket, type FeedItem } from "@/store/market";

const lw = vi.hoisted(() => {
  const series = { setData: vi.fn(), update: vi.fn() };
  const markers = { setMarkers: vi.fn() };
  const timeScale = { fitContent: vi.fn() };
  const chart = { addSeries: vi.fn(() => series), remove: vi.fn(), timeScale: vi.fn(() => timeScale) };
  return {
    series,
    markers,
    timeScale,
    chart,
    createChart: vi.fn(() => chart),
    createSeriesMarkers: vi.fn(() => markers),
  };
});

vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "solid" },
  LineSeries: "Line",
  createChart: lw.createChart,
  createSeriesMarkers: lw.createSeriesMarkers,
}));

const hist = vi.hoisted(() => ({ value: [] as { time: number; value: number }[] }));
vi.mock("@/lib/prediction-history", () => ({ useProbHistory: () => hist.value }));

import { ProbabilityChart } from "./probability-chart";

const initial = useMarket.getState();
const p = PREDICTIONS[0];
const T0 = 1_700_000_000;
const points = [
  { time: T0, value: 0.4 },
  { time: T0 + 60, value: 0.45 },
  { time: T0 + 120, value: 0.5 },
];

const feedItem = (o: Partial<FeedItem>): FeedItem => ({
  id: Math.random().toString(36),
  ts: (T0 + 70) * 1000,
  type: "oracle",
  text: "x",
  tone: "up",
  ...o,
});

beforeEach(() => {
  useMarket.setState(initial, true);
  hist.value = points;
  vi.clearAllMocks();
  lw.chart.addSeries.mockImplementation(() => lw.series);
  lw.chart.timeScale.mockImplementation(() => lw.timeScale);
  lw.createChart.mockImplementation(() => lw.chart);
  lw.createSeriesMarkers.mockImplementation(() => lw.markers);
});

describe("ProbabilityChart", () => {
  it("creates a chart at the given height and plots history as percentages", () => {
    render(<ProbabilityChart p={p} height={200} />);
    const img = screen.getByRole("img", { name: "Chance of YES over time." });
    expect(img).toHaveStyle({ height: "200px" });
    expect(lw.createChart).toHaveBeenCalledWith(img, expect.objectContaining({ height: 200, autoSize: true }));
    expect(lw.series.setData).toHaveBeenCalledWith([
      { time: T0, value: 40 },
      { time: T0 + 60, value: 45 },
      { time: T0 + 120, value: 50 },
    ]);
    expect(lw.timeScale.fitContent).toHaveBeenCalled();
  });

  it("formats prices as percentages and clamps the autoscale span", () => {
    render(<ProbabilityChart p={p} />);
    const opts = (lw.chart.addSeries.mock.calls[0] as unknown[])[1] as {
      priceFormat: { formatter: (v: number) => string };
      autoscaleInfoProvider: (o: () => unknown) => { priceRange: { minValue: number; maxValue: number } } | null;
    };
    expect(opts.priceFormat.formatter(42.345)).toBe("42.3%");
    // narrow range widens to MIN_SPAN (12) around its midpoint
    expect(
      opts.autoscaleInfoProvider(() => ({ priceRange: { minValue: 49, maxValue: 51 } }))!.priceRange,
    ).toEqual({ minValue: 44, maxValue: 56 });
    // widened range never leaves 0..100
    expect(opts.autoscaleInfoProvider(() => ({ priceRange: { minValue: 0, maxValue: 2 } }))!.priceRange).toEqual({
      minValue: 0,
      maxValue: 7,
    });
    expect(opts.autoscaleInfoProvider(() => null)).toBeNull();
  });

  it("appends a single new point with update() instead of resetting data", () => {
    const { rerender } = render(<ProbabilityChart p={p} />);
    lw.series.setData.mockClear();
    hist.value = [...points, { time: T0 + 180, value: 0.55 }];
    rerender(<ProbabilityChart p={p} />);
    expect(lw.series.update).toHaveBeenCalledWith({ time: T0 + 180, value: expect.closeTo(55) });
    expect(lw.series.setData).not.toHaveBeenCalled();
  });

  it("does not plot anything with no history", () => {
    hist.value = [];
    render(<ProbabilityChart p={p} />);
    expect(lw.series.setData).not.toHaveBeenCalled();
  });

  it("marks linked news and own trades, snapped to existing series times", () => {
    useMarket.setState({
      feed: [
        feedItem({ refId: p.assetId, type: "oracle", tone: p.sensitivity > 0 ? "up" : "down", tag: "Trailer", ts: (T0 + 70) * 1000 }),
        feedItem({ refId: p.id, type: "trade", tone: "down", ts: (T0 + 130) * 1000 }),
        // ignored: before history start, other asset, bot type
        feedItem({ refId: p.assetId, type: "oracle", ts: (T0 - 100) * 1000 }),
        feedItem({ refId: "other-asset", type: "oracle" }),
        feedItem({ refId: p.assetId, type: "bot" }),
      ],
    });
    render(<ProbabilityChart p={p} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Chance of YES over time. 1 news event marked.");
    const markers = lw.markers.setMarkers.mock.calls.at(-1)![0] as Array<Record<string, unknown>>;
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ time: T0 + 60, shape: "arrowUp", position: "belowBar", text: "Trailer", size: 1 });
    expect(markers[1]).toMatchObject({ time: T0 + 120, shape: "circle", position: "aboveBar", text: "" });
  });

  it("pluralises news events and updates live when the feed changes", () => {
    render(<ProbabilityChart p={p} />);
    act(() => {
      useMarket.setState({
        feed: [feedItem({ refId: p.assetId }), feedItem({ refId: p.assetId, tone: "down" })],
      });
    });
    expect(screen.getByRole("img")).toHaveAccessibleName("Chance of YES over time. 2 news events marked.");
  });

  it("removes the chart on unmount and recreates it when height changes", () => {
    const { rerender, unmount } = render(<ProbabilityChart p={p} height={300} />);
    rerender(<ProbabilityChart p={p} height={400} />);
    expect(lw.chart.remove).toHaveBeenCalledTimes(1);
    expect(lw.createChart).toHaveBeenCalledTimes(2);
    unmount();
    expect(lw.chart.remove).toHaveBeenCalledTimes(2);
  });
});
