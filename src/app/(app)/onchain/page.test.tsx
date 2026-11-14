import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { NEAR_CONTRACT, NEAR_RPC, type NearMarket, type NearReceipt, type NearStats } from "@/lib/near-config";
import { useMarket } from "@/store/market";

vi.mock("@/lib/solana", () => ({
  MEMO_PROGRAM_ID: { toBase58: () => "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" },
  useNotarize: () => vi.fn(),
  useAirdrop: () => vi.fn(),
}));
vi.mock("@/components/intents-panel", () => ({ IntentsPanel: () => <div data-testid="intents-panel" /> }));

import OnchainPage from "./page";
// These tests cover the cross-chain view (both wallets), as with the chain switch on.
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), CHAIN_ON: { near: true, solana: true }, MULTICHAIN: true, CHAIN_NAMES: ["NEAR", "Solana"] }));


const NEAR = "1000000000000000000000000";
const asset = ASSETS[0];
const pred = PREDICTIONS[0];
const pred2 = PREDICTIONS[1];

const market = (over: Partial<NearMarket>): NearMarket => ({
  id: "x",
  kind: "Asset",
  title: "X",
  ticker: "X",
  epi_x10: 500,
  status: "Open",
  created_at_ms: 0,
  trades: 0,
  volume_micro_usd: 0,
  oracle_updates: 0,
  yes_pool: "0",
  no_pool: "0",
  ...over,
});

const STATS: NearStats = { owner: "owner.testnet", markets: 4, receipts: 7, epi_reports: 12, total_staked: "2500000000000000000000000" };
const MARKETS: NearMarket[] = [
  market({ id: asset.id, ticker: asset.ticker, title: asset.title, epi_x10: 734, oracle_updates: 5, trades: 3, volume_micro_usd: 12_340_000 }),
  market({ id: pred.id, kind: "Prediction", title: pred.question, yes_pool: "1500000000000000000000000", no_pool: NEAR }),
  market({ id: pred2.id, kind: "Prediction", title: pred2.question, status: { Resolved: { outcome: false } } }),
  market({ id: "old-catalogue-title", ticker: "OLD", title: "Old Title" }),
];
const RECEIPTS: NearReceipt[] = [
  { id: 42, account: "bob.testnet", market_id: asset.id, side: "BUY", qty_micro: 2_500_000, price_micro: 13_450_000, ts_ms: Date.now() - 5000, chain_ref: "solana:devnet:SoLSig123456789" },
  { id: 43, account: "carol.testnet", market_id: pred.id, side: "YES", qty_micro: 10_000_000, price_micro: 420_000, ts_ms: Date.now() - 60_000, chain_ref: null },
];
const ORACLES = ["oracle.testnet", "backup-oracle.testnet"];

const encode = (v: unknown) => ({ jsonrpc: "2.0", id: "entx", result: { result: Array.from(new TextEncoder().encode(JSON.stringify(v))) } });

type Responder = (method: string, args: Record<string, unknown>) => unknown;
const ok: Responder = (method) =>
  encode(
    method === "get_stats" ? STATS : method === "get_markets" ? MARKETS : method === "get_recent_receipts" ? RECEIPTS : ORACLES,
  );

function mockRpc(respond: Responder) {
  const fn = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const args = JSON.parse(atob(body.params.args_base64));
    return new Response(JSON.stringify(respond(body.params.method_name, args)));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const panelOf = (heading: string | RegExp) =>
  screen.getByRole("heading", { name: heading }).closest(".panel") as HTMLElement;
const kpi = (label: string) => screen.getByText(label, { selector: ".label" }).parentElement as HTMLElement;

beforeEach(() => {
  useMarket.getState().reset();
  useMarket.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("On-chain page", () => {
  it("shows loading placeholders before the RPC answers", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<OnchainPage />);
    expect(screen.getByRole("heading", { level: 1, name: "On-chain" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual([
      "Reading the NEAR contract…",
      "Reading the NEAR contract…",
    ]);
    expect(screen.getByText("reading contract…")).toBeInTheDocument();
    expect(kpi("Trade receipts")).toHaveTextContent("—");
    expect(screen.getByText("Reading receipts…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(NEAR_CONTRACT) })).toHaveAttribute(
      "href",
      `https://testnet.nearblocks.io/address/${NEAR_CONTRACT}`,
    );
    expect(screen.getByTestId("intents-panel")).toBeInTheDocument();
    expect(screen.getByText("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")).toBeInTheDocument();
  });

  it("queries the four view methods on the configured contract", async () => {
    const fetch = mockRpc(ok);
    render(<OnchainPage />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const calls = fetch.mock.calls.map(([url, init]) => {
      const body = JSON.parse(String(init.body));
      return { url, account: body.params.account_id, method: body.params.method_name, args: JSON.parse(atob(body.params.args_base64)) };
    });
    expect(calls.every((c) => c.url === NEAR_RPC && c.account === NEAR_CONTRACT)).toBe(true);
    expect(calls.map((c) => c.method).sort()).toEqual(["get_markets", "get_oracles", "get_recent_receipts", "get_stats"]);
    expect(calls.find((c) => c.method === "get_markets")!.args).toEqual({ from_index: 0, limit: 100 });
    expect(calls.find((c) => c.method === "get_recent_receipts")!.args).toEqual({ limit: 20 });
  });

  it("renders stats, oracles and markets from a successful RPC read", async () => {
    mockRpc(ok);
    render(<OnchainPage />);
    await screen.findByText("oracle.testnet");
    expect(screen.getByText("backup-oracle.testnet")).toBeInTheDocument();
    expect(screen.queryByText("reading contract…")).not.toBeInTheDocument();
    expect(screen.queryByText(/contract owner/)).not.toBeInTheDocument();

    // 4 registered on NEAR (get_stats), 3 of them listed in the app, 1 legacy one from an earlier catalogue
    const reg = kpi("Markets registered on NEAR");
    expect(reg.querySelector(".num")).toHaveTextContent(/^4$/);
    expect(reg).toHaveTextContent("3 listed in app · 1 from earlier catalogues, no longer traded");
    expect(kpi("Trade receipts")).toHaveTextContent("7");
    expect(kpi("EPI reports")).toHaveTextContent("12");
    expect(kpi("Staked in pools")).toHaveTextContent("2.50 Ⓝ");
    expect(screen.getByRole("link", { name: "oracle.testnet" })).toHaveAttribute(
      "href",
      "https://testnet.nearblocks.io/address/oracle.testnet",
    );
    expect(screen.queryByText(/RPC error/)).not.toBeInTheDocument();
  });

  it("labels the contract owner in the trusted-oracle list instead of hiding it", async () => {
    mockRpc((method, args) => (method === "get_oracles" ? encode(["owner.testnet", "oracle.testnet"]) : ok(method, args)));
    render(<OnchainPage />);
    const owner = await screen.findByRole("link", { name: /owner\.testnet/ });
    expect(owner).toHaveTextContent("owner.testnet· contract owner");
    expect(screen.getByRole("link", { name: "oracle.testnet" })).not.toHaveTextContent("contract owner");
    expect(screen.getByText(/The owner is allow-listed at deploy/)).toBeInTheDocument();
  });

  it("lists live asset markets with on-chain vs app EPI, hiding legacy ids", async () => {
    mockRpc(ok);
    render(<OnchainPage />);
    const link = await screen.findByRole("link", { name: `${asset.ticker} ${asset.title}` });
    expect(link).toHaveAttribute("href", `/asset/${asset.id}`);
    expect(screen.getByRole("columnheader", { name: "Oracle EPI · NEAR" })).toBeInTheDocument();
    expect(screen.getByText(/never accumulated across visitors/)).toBeInTheDocument();
    const row = link.closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("73.4");
    expect(cells[2]).toHaveTextContent(useMarket.getState().markets[asset.id].epi.toFixed(1));
    expect(cells[3]).toHaveTextContent("5");
    expect(cells[4]).toHaveTextContent("3");
    expect(cells[5]).toHaveTextContent("$12.34");
    expect(screen.queryByText("Old Title")).not.toBeInTheDocument();
    const table = within(panelOf(/Asset markets/)).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });

  it("app EPI column tracks the local store", async () => {
    mockRpc(ok);
    render(<OnchainPage />);
    const row = (await screen.findByRole("link", { name: `${asset.ticker} ${asset.title}` })).closest("tr")!;
    act(() => {
      const s = useMarket.getState();
      useMarket.setState({ markets: { ...s.markets, [asset.id]: { ...s.markets[asset.id], epi: 12.34 } } });
    });
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("12.3");
  });

  it("shows prediction pools with NEAR amounts and resolution status", async () => {
    mockRpc(ok);
    render(<OnchainPage />);
    const open = (await screen.findByText(pred.question)).closest("tr")!;
    expect(open).toHaveTextContent("1.50 Ⓝ");
    expect(open).toHaveTextContent("1.00 Ⓝ");
    expect(within(open).getAllByRole("cell")[3]).toHaveTextContent("Open");
    const resolved = screen.getByText(pred2.question).closest("tr")!;
    expect(within(resolved).getAllByRole("cell")[3]).toHaveTextContent("Resolved NO");
    expect(resolved).toHaveTextContent("0.00 Ⓝ");
  });

  it("lists recent receipts with trader links, prices and Solana cross-refs", async () => {
    mockRpc(ok);
    render(<OnchainPage />);
    const bob = await screen.findByRole("link", { name: "bob.testnet" });
    expect(bob).toHaveAttribute("href", "https://testnet.nearblocks.io/address/bob.testnet");
    const r1 = bob.closest("tr")!;
    expect(r1).toHaveTextContent("42");
    expect(r1).toHaveTextContent("BUY");
    expect(r1).toHaveTextContent("2.50 @ $13.45");
    expect(within(r1).getByRole("link", { name: /Solana SoLSig…/ })).toHaveAttribute(
      "href",
      "https://explorer.solana.com/tx/SoLSig123456789?cluster=devnet",
    );
    expect(r1).toHaveTextContent(/[5-9]s ago/);

    const r2 = screen.getByRole("link", { name: "carol.testnet" }).closest("tr")!;
    expect(r2).toHaveTextContent("10.00 @ 42.0¢");
    expect(r2).toHaveTextContent("—");
    expect(r2).toHaveTextContent("1m ago");
    expect(screen.queryByText(/No receipts yet/)).not.toBeInTheDocument();
  });

  it("turns zero receipts and zero stakes into instructive empty states, without inventing rows", async () => {
    mockRpc((method, args) =>
      method === "get_stats"
        ? encode({ ...STATS, receipts: 0, total_staked: "0" })
        : method === "get_recent_receipts"
          ? encode([])
          : ok(method, args),
    );
    render(<OnchainPage />);
    expect(await screen.findByText("No trade receipts on this contract yet.")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Make a trade to write the first receipt/ });
    expect(cta.getAttribute("href")).toMatch(/^\/asset\//);
    expect(within(kpi("Trade receipts")).getByRole("link", { name: /Make the first trade/ })).toHaveAttribute(
      "href",
      cta.getAttribute("href"),
    );
    expect(within(kpi("Staked in pools")).getByRole("link", { name: /Stake on a prediction/ })).toHaveAttribute(
      "href",
      "/predictions",
    );
    // Contract-level facts still lead with real numbers.
    expect(kpi("EPI reports")).toHaveTextContent("12");
    expect(within(panelOf(/Latest NEAR trade receipts/)).queryByRole("table")).toBeNull();
  });

  it("shows an RPC error state when the contract call fails", async () => {
    mockRpc(() => ({ jsonrpc: "2.0", id: "entx", error: { message: "Server error" } }));
    render(<OnchainPage />);
    expect(await screen.findByText(/RPC error:/)).toHaveTextContent('RPC error: {"message":"Server error"}');
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual([
      "Couldn't reach NEAR testnet. Try Refresh.",
      "Couldn't reach NEAR testnet. Try Refresh.",
    ]);
    expect(kpi("Markets registered on NEAR")).toHaveTextContent("—");
  });

  it("surfaces a contract-level error (result.error) and network failures", async () => {
    mockRpc(() => ({ jsonrpc: "2.0", id: "entx", result: { error: "MethodNotFound" } }));
    const { unmount } = render(<OnchainPage />);
    expect(await screen.findByText(/RPC error:/)).toHaveTextContent('RPC error: "MethodNotFound"');
    unmount();

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<OnchainPage />);
    expect(await screen.findByText(/RPC error:/)).toHaveTextContent("RPC error: Failed to fetch");
  });

  it("Refresh re-reads the contract and clears a previous error", async () => {
    const user = userEvent.setup();
    let fail = true;
    const fetch = mockRpc((method, args) => (fail ? { error: "down" } : ok(method, args)));
    render(<OnchainPage />);
    await screen.findByText(/RPC error:/);
    fail = false;
    await user.click(screen.getByRole("button", { name: /Refresh/ }));
    await screen.findByText("oracle.testnet");
    expect(screen.queryByText(/RPC error:/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it("polls the contract every 15 seconds and stops on unmount", async () => {
    vi.useFakeTimers();
    const fetch = mockRpc(ok);
    const { unmount } = render(<OnchainPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetch).toHaveBeenCalledTimes(8);
    unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(8);
  });
});
