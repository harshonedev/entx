import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { yesPrice } from "@/lib/engine";
import { STARTING_CASH, portfolioValue, priceOf, useMarket } from "@/store/market";
import { num, pct, usd } from "@/lib/format";

const env = vi.hoisted(() => ({
  wallet: { connected: false, publicKey: null as null | { toBase58: () => string } },
  nearAccount: null as string | null,
  notarize: vi.fn(),
  nearNotarize: vi.fn(),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={String(props.src)} />,
}));
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => env.wallet,
  useConnection: () => ({ connection: {} }),
}));
vi.mock("@/lib/solana", () => ({
  useNotarize: () => env.notarize,
  useAirdrop: () => vi.fn(),
  MEMO_PROGRAM_ID: { toBase58: () => "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" },
}));
vi.mock("@/lib/near", () => ({
  useNear: () => ({
    accountId: env.nearAccount,
    ready: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    call: vi.fn(),
  }),
  useNearNotarize: () => env.nearNotarize,
}));

import PortfolioPage from "./page";
// These tests cover the cross-chain view (both wallets), as with the chain switch on.
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), CHAIN_ON: { near: true, solana: true }, MULTICHAIN: true, CHAIN_NAMES: ["NEAR", "Solana"] }));


const panelOf = (heading: string | RegExp) =>
  screen.getByRole("heading", { name: heading }).closest(".panel") as HTMLElement;
const card = (label: string) => screen.getByText(label, { selector: ".label" }).parentElement as HTMLElement;

beforeEach(() => {
  env.wallet = { connected: false, publicKey: null };
  env.nearAccount = null;
  env.notarize.mockReset();
  env.nearNotarize.mockReset();
  useMarket.getState().reset();
  useMarket.setState({ toasts: [] });
});

describe("Portfolio page", () => {
  it("renders empty states for a fresh demo account", () => {
    render(<PortfolioPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByText(/Connect a NEAR and\/or Solana wallet/)).toBeInTheDocument();
    expect(card("Total value")).toHaveTextContent(usd(STARTING_CASH));
    expect(card("Total value")).toHaveTextContent(`${pct(0)} all-time`);
    expect(card("Available cash")).toHaveTextContent(usd(STARTING_CASH));
    expect(card("Holdings")).toHaveTextContent("$0.00");
    expect(card("Predictions")).toHaveTextContent("$0.00");

    // One instructive empty state instead of three empty panels.
    const empty = panelOf("Nothing traded yet");
    expect(within(empty).getByRole("link", { name: /^Trade / }).getAttribute("href")).toMatch(/^\/asset\//);
    expect(within(empty).getByRole("link", { name: "Browse predictions" })).toHaveAttribute("href", "/predictions");
    expect(within(empty).getByRole("link", { name: "All markets" })).toHaveAttribute("href", "/markets");
    expect(screen.queryByRole("heading", { name: "Holdings" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Open predictions" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Trade history" })).toBeNull();
  });

  it("keeps per-panel empty messages once there is some activity", () => {
    act(() => {
      useMarket.getState().predict(PREDICTIONS[0].id, "YES", 10);
    });
    render(<PortfolioPage />);
    expect(within(panelOf("Holdings")).getByRole("link", { name: /Discover titles to trade/ })).toHaveAttribute("href", "/markets");
    expect(screen.queryByRole("heading", { name: "Nothing traded yet" })).toBeNull();
  });

  it("sells a whole holding in one click", async () => {
    const user = userEvent.setup();
    const a = ASSETS[0];
    act(() => {
      useMarket.getState().buy(a.id, 3);
    });
    render(<PortfolioPage />);
    await user.click(screen.getByRole("button", { name: `Sell all 3 ${a.ticker}` }));
    const s = useMarket.getState();
    expect(s.holdings[a.id]).toBeUndefined();
    expect(s.trades[0]).toMatchObject({ kind: "SELL", refId: a.id, qty: 3 });
    expect(s.toasts.at(-1)?.title).toBe(`Sold all 3 ${a.ticker}`);
    expect(panelOf("Holdings")).toHaveTextContent("No holdings yet.");
  });

  it("shows a holding with units, price, value and P&L after a buy", () => {
    const a = ASSETS[0];
    act(() => {
      useMarket.getState().buy(a.id, 3);
    });
    render(<PortfolioPage />);
    const s = useMarket.getState();
    const h = s.holdings[a.id];
    const p = priceOf(s.markets[a.id]);

    const table = within(panelOf("Holdings")).getByRole("table");
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getByRole("link")).toHaveAttribute("href", `/asset/${a.id}`);
    expect(row).toHaveTextContent(a.title);
    expect(row).toHaveTextContent(a.ticker);
    const cells = within(row).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent(num(3, 0));
    expect(cells[2]).toHaveTextContent(usd(h.cost / h.units));
    expect(cells[3]).toHaveTextContent(usd(p));
    expect(cells[4]).toHaveTextContent(usd(3 * p));
    expect(cells[5]).toHaveTextContent(usd(3 * p - h.cost));

    const v = portfolioValue(s);
    expect(card("Total value")).toHaveTextContent(usd(v.total));
    expect(card("Available cash")).toHaveTextContent(usd(s.cash));
    expect(card("Holdings")).toHaveTextContent(usd(v.holdings));
    expect(s.cash).toBeLessThan(STARTING_CASH);
  });

  it("lists trades in history with side, label and totals", () => {
    const a = ASSETS[1];
    act(() => {
      useMarket.getState().buy(a.id, 2);
      useMarket.getState().sell(a.id, 1);
    });
    render(<PortfolioPage />);
    const table = within(panelOf("Trade history")).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const [sell, buy] = useMarket.getState().trades;
    expect(rows[0]).toHaveTextContent("SELL");
    // Spot trades read title + ticker and link to the asset.
    expect(rows[0]).toHaveTextContent(a.title);
    expect(rows[0]).toHaveTextContent(a.ticker);
    expect(within(rows[0]).getByRole("link", { name: new RegExp(a.title) })).toHaveAttribute("href", `/asset/${a.id}`);
    expect(rows[0]).toHaveTextContent(usd(sell.total));
    expect(rows[1]).toHaveTextContent("BUY");
    expect(rows[1]).toHaveTextContent(usd(buy.total));
    // Without a wallet, receipt columns are dashes and a hint is shown.
    expect(screen.getByText(/Connect a wallet to sign on-chain receipts/)).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Record/ })).not.toBeInTheDocument();
  });

  it("shows open prediction positions with value and link to the market", () => {
    const p = PREDICTIONS[0];
    act(() => {
      useMarket.getState().predict(p.id, "YES", 50);
    });
    render(<PortfolioPage />);
    const s = useMarket.getState();
    const pos = s.positions[0];
    const yp = yesPrice(s.predictions[p.id].pool);
    const list = panelOf("Open predictions");
    expect(within(list).getByRole("link", { name: p.question })).toHaveAttribute("href", `/predictions/${p.id}`);
    expect(list).toHaveTextContent("YES");
    // Fill price (avg) and live price are labelled separately, plus cost and payout if right.
    expect(list).toHaveTextContent(
      `${num(pos.shares, 1)} sh · avg ${((pos.cost / pos.shares) * 100).toFixed(1)}¢ · now ${(yp * 100).toFixed(1)}¢ · cost ${usd(pos.cost)} · pays ${usd(pos.shares)} if right`,
    );
    expect(list).toHaveTextContent(usd(pos.shares * yp));
    expect(card("Predictions")).toHaveTextContent(usd(pos.shares * yp));

    const history = within(panelOf("Trade history")).getByRole("table");
    expect(history).toHaveTextContent(`${(s.trades[0].price * 100).toFixed(1)}¢`);
    // Prediction trades read the question, tagged as a prediction.
    const tradeRow = within(history).getAllByRole("row")[1];
    expect(tradeRow).toHaveTextContent("Prediction");
    expect(within(tradeRow).getByRole("link", { name: new RegExp("Prediction") })).toHaveAttribute(
      "href",
      `/predictions/${p.id}`,
    );
  });

  it("resolving a winning prediction pays out and clears the position", () => {
    const p = PREDICTIONS[0];
    act(() => {
      useMarket.getState().predict(p.id, "NO", 20);
    });
    const { rerender } = render(<PortfolioPage />);
    act(() => useMarket.getState().resolve(p.id, "NO"));
    rerender(<PortfolioPage />);
    expect(panelOf("Open predictions")).toHaveTextContent("No open predictions.");
    const rows = within(within(panelOf("Trade history")).getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("PAYOUT");
    expect(useMarket.getState().realized).toBeGreaterThan(0);
  });

  it("places the demo trader on the leaderboard by return", () => {
    render(<PortfolioPage />);
    const board = screen.getByRole("heading", { name: /Leaderboard/ }).parentElement!.parentElement as HTMLElement;
    const items = within(board).getAllByRole("listitem");
    expect(items).toHaveLength(8);
    const you = items.find((li) => li.textContent?.includes("YOU"))!;
    expect(you).toHaveTextContent("demo-trader");
    expect(you).toHaveTextContent(pct(0, 1));
    // 0% sits between streamwatcher (+6.4%) and sequel_skeptic (-3.8%)
    expect(items.indexOf(you)).toBe(5);
    expect(items[0]).toHaveTextContent("reeltrader.sol");
  });

  it("never shows a negative zero return on the leaderboard", () => {
    act(() => {
      // A tiny loss that rounds to 0.0% at one decimal.
      useMarket.setState({ cash: STARTING_CASH - 0.2 });
    });
    render(<PortfolioPage />);
    const you = screen.getByText("YOU").closest("li")!;
    expect(you).toHaveTextContent(pct(0, 1));
    expect(you).not.toHaveTextContent("-0.0%");
  });

  it("uses the NEAR account name and wallet description when connected", () => {
    env.nearAccount = "alice.testnet";
    env.wallet = { connected: true, publicKey: { toBase58: () => "So1anaPubKey1111111111111111111111XyZ9" } };
    render(<PortfolioPage />);
    expect(screen.getByText("Solana So1a…XyZ9 (devnet) · NEAR alice.testnet (testnet)")).toBeInTheDocument();
    const you = screen.getByText("YOU").closest("li")!;
    expect(you).toHaveTextContent("alice.testnet");
  });

  it("offers Record buttons for receipts when wallets are connected", async () => {
    const user = userEvent.setup();
    env.nearAccount = "alice.testnet";
    env.wallet = { connected: true, publicKey: { toBase58: () => "So1anaPubKey1111111111111111111111XyZ9" } };
    const a = ASSETS[0];
    act(() => {
      useMarket.getState().buy(a.id, 1);
    });
    render(<PortfolioPage />);
    const trade = useMarket.getState().trades[0];
    const [sol, near] = screen.getAllByRole("button", { name: "Record" });
    await user.click(sol);
    expect(env.notarize).toHaveBeenCalledWith(trade);
    await user.click(near);
    expect(env.nearNotarize).toHaveBeenCalledWith(trade, undefined);
    expect(screen.queryByText(/Connect a wallet to sign/)).not.toBeInTheDocument();
  });

  it("renders confirmed and pending receipt states with explorer links", () => {
    env.wallet = { connected: true, publicKey: { toBase58: () => "So1anaPubKey1111111111111111111111XyZ9" } };
    env.nearAccount = "alice.testnet";
    act(() => {
      useMarket.getState().buy(ASSETS[0].id, 1);
      useMarket.getState().buy(ASSETS[1].id, 1);
    });
    const [t2, t1] = useMarket.getState().trades;
    act(() => {
      useMarket.getState().setTradeSig(t1.id, { sig: "5igSolanaSignatureAAAA", sigStatus: "confirmed" });
      useMarket.getState().setTradeNear(t1.id, { nearTx: "NearTxHash1234567", nearStatus: "confirmed" });
      useMarket.getState().setTradeSig(t2.id, { sigStatus: "pending" });
      useMarket.getState().setTradeNear(t2.id, { nearStatus: "failed" });
    });
    render(<PortfolioPage />);
    expect(screen.getByRole("link", { name: /5igSolan…/ })).toHaveAttribute(
      "href",
      "https://explorer.solana.com/tx/5igSolanaSignatureAAAA?cluster=devnet",
    );
    expect(screen.getByRole("link", { name: /NearTxHa…/ })).toHaveAttribute(
      "href",
      "https://testnet.nearblocks.io/txns/NearTxHash1234567",
    );
    expect(screen.getByText("confirming")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("Reset demo asks for an in-page confirmation and only resets when confirmed", async () => {
    const user = userEvent.setup();
    act(() => {
      useMarket.getState().buy(ASSETS[0].id, 1);
    });
    render(<PortfolioPage />);
    await user.click(screen.getByRole("button", { name: /Reset demo/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(Object.keys(useMarket.getState().holdings)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /Reset demo/ }));
    await user.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(useMarket.getState().holdings).toEqual({});
    expect(useMarket.getState().cash).toBe(STARTING_CASH);
    expect(screen.getByRole("heading", { name: "Nothing traded yet" })).toBeInTheDocument();
  });
});
