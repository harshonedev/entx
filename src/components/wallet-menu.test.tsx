import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const near = vi.hoisted(() => ({
  accountId: null as string | null,
  ready: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
const sol = vi.hoisted(() => ({ publicKey: null as null | { toBase58: () => string }, disconnect: vi.fn() }));
const modal = vi.hoisted(() => ({ setVisible: vi.fn() }));

vi.mock("@/lib/near", () => ({ useNear: () => near }));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => sol }));
vi.mock("@solana/wallet-adapter-react-ui", () => ({ useWalletModal: () => modal }));

import { WalletMenu } from "./wallet-menu";
// These tests cover the cross-chain view (both wallets), as with the chain switch on.
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), CHAIN_ON: { near: true, solana: true }, MULTICHAIN: true, CHAIN_NAMES: ["NEAR", "Solana"] }));


const SOL_KEY = "So1ana1111111111111111111111111111111XyZ9";

beforeEach(() => {
  near.accountId = null;
  near.ready = true;
  near.connect.mockReset();
  near.disconnect.mockReset();
  sol.publicKey = null;
  sol.disconnect.mockReset().mockResolvedValue(undefined);
  modal.setVisible.mockReset();
});

describe("WalletMenu", () => {
  it("shows 'Connect wallet' when nothing is connected and opens a dialog", async () => {
    const user = userEvent.setup();
    render(<WalletMenu />);
    const btn = screen.getByRole("button", { name: "Connect wallet" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Wallets" })).toBeInTheDocument();
    expect(screen.getByText("NEAR testnet")).toBeInTheDocument();
    expect(screen.getByText("Solana devnet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(2);
  });

  it("closes on Escape, outside pointerdown and trigger re-click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <WalletMenu />
        <p>outside</p>
      </div>,
    );
    const btn = screen.getByRole("button", { name: "Connect wallet" });
    await user.click(btn);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(btn);
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(btn);
    // clicking inside the dialog keeps it open
    fireEvent.pointerDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(btn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("connects NEAR and closes the menu", async () => {
    const user = userEvent.setup();
    render(<WalletMenu />);
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));
    const [nearConnect] = screen.getAllByRole("button", { name: "Connect" });
    await user.click(nearConnect);
    expect(near.connect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables NEAR connect until the connector is ready", async () => {
    near.ready = false;
    const user = userEvent.setup();
    render(<WalletMenu />);
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));
    const [nearConnect, solConnect] = screen.getAllByRole("button", { name: "Connect" });
    expect(nearConnect).toBeDisabled();
    expect(solConnect).toBeEnabled();
  });

  it("opens the Solana wallet modal", async () => {
    const user = userEvent.setup();
    render(<WalletMenu />);
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));
    await user.click(screen.getAllByRole("button", { name: "Connect" })[1]);
    expect(modal.setVisible).toHaveBeenCalledWith(true);
    expect(near.connect).not.toHaveBeenCalled();
  });

  it("labels with the NEAR account and allows disconnecting", async () => {
    near.accountId = "alice.testnet";
    const user = userEvent.setup();
    render(<WalletMenu />);
    const btn = screen.getByRole("button", { name: "alice.testnet" });
    await user.click(btn);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("alice.testnet");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(near.disconnect).toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(1);
  });

  it("labels with a shortened Solana key and disconnects Solana", async () => {
    sol.publicKey = { toBase58: () => SOL_KEY };
    const user = userEvent.setup();
    render(<WalletMenu />);
    await user.click(screen.getByRole("button", { name: "So1a…XyZ9" }));
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(sol.disconnect).toHaveBeenCalled();
  });

  it("summarises two connected wallets", () => {
    near.accountId = "alice.testnet";
    sol.publicKey = { toBase58: () => SOL_KEY };
    render(<WalletMenu />);
    expect(screen.getByRole("button", { name: "2 wallets" })).toBeInTheDocument();
  });
});
