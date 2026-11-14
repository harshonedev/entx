import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const wallet = vi.hoisted(() => ({ publicKey: null as null | { toBase58: () => string } }));
const near = vi.hoisted(() => ({ accountId: null as string | null }));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => wallet }));
vi.mock("@/lib/near", () => ({ useNear: () => near }));

import { IntentsPanel } from "./intents-panel";

const QUOTE = {
  amountInFormatted: "1",
  amountInUsd: "180.5",
  amountOutFormatted: "179.876",
  amountOutUsd: "179.87",
  minAmountOut: "178500000",
  timeEstimate: 20,
};

const okResponse = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;
const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

beforeEach(() => {
  wallet.publicKey = null;
  near.accountId = null;
  fetchMock = vi.fn(() => okResponse({ quote: QUOTE, timestamp: "2026-01-01T12:00:00Z" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("IntentsPanel", () => {
  it("fetches a dry-run quote for the default SOL origin and renders it", async () => {
    render(<IntentsPanel />);
    expect(screen.getByLabelText("Amount to send")).toHaveValue("1");
    await screen.findByText("179.88");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/intents/quote");
    expect(bodies()[0]).toEqual({ originAsset: "nep141:sol.omft.near", amount: 1 });
    expect(screen.getByText("≈ $180.50")).toBeInTheDocument();
    expect(screen.getByText(/min 178\.50 · ~20s/)).toBeInTheDocument();
    expect(screen.getByText(/^quoted /)).toBeInTheDocument();
  });

  it("passes connected wallets as refund and recipient", async () => {
    wallet.publicKey = { toBase58: () => "SoLKey111" };
    near.accountId = "alice.testnet";
    render(<IntentsPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodies()[0]).toMatchObject({ refundTo: "SoLKey111", recipient: "alice.testnet" });
  });

  it("switching origin resets the amount and requotes", async () => {
    const user = userEvent.setup();
    render(<IntentsPanel />);
    await screen.findByText("179.88");
    await user.click(screen.getByRole("button", { name: /ETH · Ethereum/ }));
    expect(screen.getByLabelText("Amount to send")).toHaveValue("0.05");
    expect(screen.getByText("You send (Ethereum)")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodies()[1]).toEqual({ originAsset: "nep141:eth.omft.near", amount: 0.05 });
  });

  it("debounces typing into a single request and strips non-numeric chars", async () => {
    const user = userEvent.setup();
    render(<IntentsPanel />);
    await screen.findByText("179.88");
    const input = screen.getByLabelText("Amount to send");
    await user.clear(input);
    await user.type(input, "2x5");
    expect(input).toHaveValue("25");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodies()[1].amount).toBe(25);
  });

  it("does not request a quote for zero or empty amounts", async () => {
    const user = userEvent.setup();
    render(<IntentsPanel />);
    await screen.findByText("179.88");
    const input = screen.getByLabelText("Amount to send");
    await user.clear(input);
    await user.type(input, "0");
    await new Promise((r) => setTimeout(r, 600));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the API error and clears the quote", async () => {
    fetchMock.mockImplementation(() => okResponse({ error: "No route for asset" }, false));
    render(<IntentsPanel />);
    expect(await screen.findByText("No route for asset")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/^≈/)).not.toBeInTheDocument();
  });

  it("falls back to a generic error message", async () => {
    fetchMock.mockImplementation(() => okResponse({}, false));
    render(<IntentsPanel />);
    expect(await screen.findByText("Quote failed")).toBeInTheDocument();
  });

  it("surfaces network errors", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("network down")));
    render(<IntentsPanel />);
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });
});
