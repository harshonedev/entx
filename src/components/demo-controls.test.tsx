import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS, ASSET_BY_ID, ORACLE_EVENTS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { useMarket } from "@/store/market";
import { DemoControls } from "./demo-controls";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const initial = useMarket.getState();
const fetchMock = vi.fn();

beforeEach(() => {
  useMarket.setState(initial, true);
  pathname = "/";
  fetchMock.mockReset();
  // The store publishes oracle events to /api/oracle; fail it so the demo stays off-chain.
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "offline" }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const toggle = () => screen.getByRole("button", { name: "Demo controls" });
const openPanel = async () => {
  await userEvent.click(toggle());
  return screen.getByRole("dialog", { name: "Demo controls" });
};

describe("DemoControls", () => {
  it("is closed by default and toggles open with aria-expanded", async () => {
    render(<DemoControls />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
    const dialog = await openPanel();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveFocus();
    await userEvent.click(toggle());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes with Escape and with the close button", async () => {
    render(<DemoControls />);
    await openPanel();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Close demo controls" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("defaults the title picker to the first asset off asset pages", async () => {
    render(<DemoControls />);
    await openPanel();
    const select = screen.getByLabelText("Title") as HTMLSelectElement;
    expect(select.value).toBe(ASSETS[0].id);
    expect(within(select).getAllByRole("option")).toHaveLength(ASSETS.length);
  });

  it("defaults to the asset of the current /asset/[id] route", async () => {
    pathname = `/asset/${ASSETS[3].id}`;
    render(<DemoControls />);
    await openPanel();
    expect((screen.getByLabelText("Title") as HTMLSelectElement).value).toBe(ASSETS[3].id);
  });

  it("ignores an unknown asset id in the route", async () => {
    pathname = "/asset/does-not-exist";
    render(<DemoControls />);
    await openPanel();
    expect((screen.getByLabelText("Title") as HTMLSelectElement).value).toBe(ASSETS[0].id);
  });

  it("lists every oracle news event with its EPI deltas", async () => {
    render(<DemoControls />);
    await openPanel();
    for (const e of ORACLE_EVENTS) expect(screen.getByRole("button", { name: new RegExp(e.label) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Box office beats forecast/ })).toHaveTextContent("Box office +14 · Social +6");
    expect(screen.getByRole("button", { name: /Reviews disappoint/ })).toHaveTextContent("Rating -22");
  });

  it("pushes a news event through the oracle for the picked title", async () => {
    render(<DemoControls />);
    await openPanel();
    const target = ASSETS[2];
    await userEvent.selectOptions(screen.getByLabelText("Title"), target.id);
    const before = useMarket.getState().markets[target.id];
    await userEvent.click(screen.getByRole("button", { name: /Trailer goes viral/ }));

    const after = useMarket.getState().markets[target.id];
    expect(after.epi).toBeGreaterThan(before.epi);
    expect(after.momentum).toBeGreaterThan(0);
    expect(useMarket.getState().feed[0]).toMatchObject({ type: "oracle", refId: target.id, tag: "Trailer goes viral" });
    expect(fetchMock).toHaveBeenCalledWith("/api/oracle", expect.objectContaining({ method: "POST" }));
    // momentum status line appears for the reacting ticker
    expect(screen.getByRole("status")).toHaveTextContent(new RegExp(`${ASSET_BY_ID[target.id].ticker} reacting: buy pressure`));
  });

  it("shows sell pressure after negative news", async () => {
    render(<DemoControls />);
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: /Reviews disappoint/ }));
    expect(screen.getByRole("status")).toHaveTextContent(/reacting: sell pressure/);
  });

  it("lets you settle the selected title's open predictions early", async () => {
    const pred = PREDICTIONS.find((p) => p.assetId)!;
    pathname = `/asset/${pred.assetId}`;
    const linked = PREDICTIONS.filter((p) => p.assetId === pred.assetId);
    render(<DemoControls />);
    await openPanel();
    expect(screen.getByText("Settle a prediction early")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Settle YES" })).toHaveLength(linked.length);

    const item = screen.getByText(pred.question).closest("li")!;
    await userEvent.click(within(item).getByRole("button", { name: "Settle NO" }));
    expect(useMarket.getState().predictions[pred.id].resolved).toBe("NO");
    expect(screen.queryByText(pred.question)).toBeNull();
  });

  it("hides the settle section when the title has no open predictions", async () => {
    const withPreds = new Set(PREDICTIONS.map((p) => p.assetId));
    const lonely = ASSETS.find((a) => !withPreds.has(a.id))!;
    pathname = `/asset/${lonely.id}`;
    render(<DemoControls />);
    await openPanel();
    expect(screen.queryByText("Settle a prediction early")).toBeNull();
  });
});
