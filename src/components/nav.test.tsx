import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { useMarket } from "@/store/market";

const nav = vi.hoisted(() => ({ path: "/", push: vi.fn() }));
const wallet = vi.hoisted(() => ({ connected: false, publicKey: null }));
const near = vi.hoisted(() => ({ accountId: null as string | null, ready: true, connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) }));
const airdrop = vi.hoisted(() => vi.fn());
const solModal = vi.hoisted(() => ({ setVisible: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => wallet }));
vi.mock("@solana/wallet-adapter-react-ui", () => ({ useWalletModal: () => solModal }));
vi.mock("@/lib/near", () => ({ useNear: () => near }));
vi.mock("@/lib/solana", () => ({ useAirdrop: () => airdrop }));
vi.mock("./wallet-menu", () => ({ WalletMenu: () => <button>wallet-menu</button> }));
vi.mock("./demo-controls", () => ({ DemoControls: () => <button>demo</button> }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={props.src} />,
}));

import { Shell } from "./nav";
// These tests cover the cross-chain view (both wallets), as with the chain switch on.
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), CHAIN_ON: { near: true, solana: true }, MULTICHAIN: true, CHAIN_NAMES: ["NEAR", "Solana"] }));


const initial = useMarket.getState();

beforeAll(() => {
  // Drawer checks reduced motion; reporting "reduce" also skips Element.animate, which jsdom lacks.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  useMarket.setState(initial, true);
  nav.path = "/";
  nav.push.mockReset();
  wallet.connected = false;
  near.accountId = null;
  near.connect.mockReset();
  near.connect.mockImplementation(async () => {});
  near.ready = true;
  solModal.setVisible.mockReset();
  airdrop.mockReset();
});

const mainNav = () => screen.getAllByRole("navigation", { name: "Main" })[0];

describe("Shell", () => {
  it("renders children and the main nav links", () => {
    render(<Shell>page body</Shell>);
    expect(screen.getByText("page body")).toBeInTheDocument();
    const links = within(mainNav()).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/markets", "/predictions", "/epi", "/portfolio", "/onchain"]);
  });

  it.each([
    ["/markets", "Discover"],
    ["/asset/foo", "Discover"],
    ["/predictions/abc", "Predictions"],
    ["/portfolio", "Portfolio"],
  ])("marks the active link for %s", (path, label) => {
    nav.path = path;
    render(<Shell>x</Shell>);
    const current = within(mainNav()).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });

  it("keeps the dateline strip: environment badge, network, receipts and portfolio", () => {
    render(<Shell>x</Shell>);
    expect(within(mainNav()).getByRole("link", { name: "On-chain" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Receipts off" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Portfolio \$/ })).toHaveAttribute("href", "/portfolio");
  });

  it("shows portfolio value from the store", async () => {
    render(<Shell>x</Shell>);
    const card = screen.getByRole("link", { name: /^Portfolio \$/ });
    expect(card).toHaveAttribute("href", "/portfolio");
    expect(card).toHaveAccessibleName(/(^|[^+])0\.00% all time/);
    act(() => useMarket.setState({ cash: 1100 }));
    expect(card).toHaveAccessibleName(/\+10\.00% all time/);
  });

  describe("receipt toggles", () => {
    it("the strip offers a connect per chain instead of dead switches", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      const strip = within(screen.getByRole("group", { name: "Receipts off" }));
      await user.click(strip.getByRole("button", { name: "Connect NEAR" }));
      expect(near.connect).toHaveBeenCalledOnce();
      await user.click(strip.getByRole("button", { name: "Connect Solana" }));
      expect(solModal.setVisible).toHaveBeenCalledWith(true);
    });

    it("treats a closed NEAR selector as a cancel, not an unhandled error", async () => {
      near.connect.mockImplementation(() => Promise.reject(new Error("User closed the modal")));
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(screen.getByRole("button", { name: "Connect NEAR" }));
      expect(near.connect).toHaveBeenCalledOnce();
    });

    it("keeps the NEAR connect focusable but inert while the connector loads", async () => {
      near.ready = false;
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      const cta = screen.getByRole("button", { name: "Connect NEAR" });
      expect(cta).toHaveAttribute("aria-disabled", "true");
      expect(cta).not.toBeDisabled();
      await user.click(cta);
      expect(near.connect).not.toHaveBeenCalled();
    });

    it("are disabled with a hint in the drawer when no wallet is connected", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const drawer = within(screen.getByRole("dialog", { name: "Navigation" }));
      const sol = drawer.getByRole("button", { name: /^Solana/ });
      const nr = drawer.getByRole("button", { name: /^NEAR/ });
      // aria-disabled, not disabled: the rows stay focusable and describe why they are off.
      expect(sol).toHaveAttribute("aria-disabled", "true");
      expect(nr).toHaveAttribute("aria-disabled", "true");
      expect(sol).toHaveAttribute("aria-pressed", "false");
      expect(sol).toHaveAccessibleDescription("Connect a Solana or NEAR wallet to sign receipts for your trades.");
      sol.focus();
      expect(sol).toHaveFocus();
      const before = useMarket.getState().chains;
      await user.click(sol);
      expect(useMarket.getState().chains).toEqual(before);
    });

    it("toggle chain prefs once the wallet is connected", async () => {
      near.accountId = "alice.testnet";
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      const nr = screen.getByRole("button", { name: /^NEAR/ });
      expect(nr).not.toHaveAttribute("aria-disabled");
      expect(nr).not.toHaveAccessibleDescription();
      expect(nr).toHaveAttribute("aria-pressed", "true");
      // The other chain stays reachable from the strip.
      expect(within(screen.getByRole("group", { name: "Receipts" })).getByRole("button", { name: "Connect Solana" })).toBeInTheDocument();
      await user.click(nr);
      expect(useMarket.getState().chains.near).toBe(false);
      expect(nr).toHaveAttribute("aria-pressed", "false");
      expect(useMarket.getState().chains.solana).toBe(true);
    });
  });

  describe("mobile drawer", () => {
    it("opens as a modal, focuses the active link, and closes with Escape", async () => {
      nav.path = "/epi";
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      const opener = screen.getByRole("button", { name: "Open menu" });
      await user.click(opener);
      const dialog = screen.getByRole("dialog", { name: "Navigation" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(document.body.style.overflow).toBe("hidden");
      expect(within(dialog).getByRole("link", { name: "EPI" })).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe("");
      expect(opener).toHaveFocus();
    });

    it("closes from the close button and on navigation", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      await user.click(screen.getByRole("button", { name: "Close menu" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("link", { name: "Portfolio" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("traps Tab focus inside the drawer", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const dialog = screen.getByRole("dialog");
      const close = within(dialog).getByRole("button", { name: "Close menu" });
      close.focus();
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(close);
      // forward from the last element wraps to the first (close button)
      await user.keyboard("{Tab}");
      expect(close).toHaveFocus();
    });
  });

  describe("asset search", () => {
    const search = () => screen.getByRole("combobox", { name: "Search titles and markets" });

    it("phone search button focuses the field in the same tap and gets focus back on Escape", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(screen.getByRole("button", { name: "Search titles and markets" }));
      expect(search()).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("button", { name: "Search titles and markets" })).toHaveFocus();
    });

    it("opens grouped titles and prediction markets on focus and filters by title or ticker", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await user.click(search());
      expect(search()).toHaveAttribute("aria-expanded", "true");
      expect(within(screen.getByRole("group", { name: "Titles" })).getAllByRole("option")).toHaveLength(4);
      expect(within(screen.getByRole("group", { name: "Prediction markets" })).getAllByRole("option")).toHaveLength(3);

      const target = ASSETS[3];
      await user.type(search(), target.ticker);
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent(target.title);
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(search()).toHaveAttribute("aria-activedescendant", options[0].id);
    });

    it("says nothing matched and suggests the 3 most-traded titles", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.type(search(), "zzzzqqqq-no-match");
      expect(screen.getByText(/Nothing matches/)).toHaveTextContent("Nothing matches “zzzzqqqq-no-match”. Most traded titles:");
      const list = screen.getByRole("listbox", { name: "Suggested titles" });
      const m = useMarket.getState().markets;
      const top = [...ASSETS].sort((a, b) => m[b.id].volume24h - m[a.id].volume24h).slice(0, 3);
      const options = within(list).getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual(top.map((a) => expect.stringContaining(a.title)));
      await user.keyboard("{Enter}");
      expect(nav.push).toHaveBeenCalledWith(`/asset/${top[0].id}`);
    });

    it("navigates with arrow keys and Enter", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(search());
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
      expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
      await user.keyboard("{Enter}");
      expect(nav.push).toHaveBeenCalledWith(`/asset/${ASSETS[1].id}`);
      expect(search()).toHaveValue("");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("finds prediction markets by question text and opens the market", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      const market = PREDICTIONS[0];
      // Two words from the question, out of order, still match.
      const words = market.question.replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 3);
      await user.type(search(), `${words[2]} ${words[0]}`);
      const group = screen.getByRole("group", { name: "Prediction markets" });
      const opt = within(group)
        .getAllByRole("option")
        .find((o) => o.textContent?.includes(market.question))!;
      expect(opt).toBeDefined();
      // Arrow down through the titles group into the markets group.
      const all = screen.getAllByRole("option");
      for (let i = 0; i < all.indexOf(opt); i++) await user.keyboard("{ArrowDown}");
      expect(opt).toHaveAttribute("aria-selected", "true");
      expect(search()).toHaveAttribute("aria-activedescendant", opt.id);
      await user.keyboard("{Enter}");
      expect(nav.push).toHaveBeenCalledWith(`/predictions/${market.id}`);
    });

    it("navigates on mouse selection", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(search());
      await user.click(screen.getAllByRole("option")[2]);
      expect(nav.push).toHaveBeenCalledWith(`/asset/${ASSETS[2].id}`);
    });

    it("focuses on Cmd/Ctrl+K and closes on Escape", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.keyboard("{Meta>}k{/Meta}");
      expect(search()).toHaveFocus();
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(search()).not.toHaveFocus();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await user.keyboard("{Control>}k{/Control}");
      expect(search()).toHaveFocus();
    });
  });

  describe("top bar", () => {
    it("shows the airdrop button only with a connected Solana wallet", async () => {
      const { unmount } = render(<Shell>x</Shell>);
      expect(screen.queryByRole("button", { name: "Request devnet SOL airdrop" })).not.toBeInTheDocument();
      unmount();
      wallet.connected = true;
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.click(screen.getByRole("button", { name: "Request devnet SOL airdrop" }));
      expect(airdrop).toHaveBeenCalledTimes(1);
    });

    it("renders market stat chips, demo controls and the wallet menu", () => {
      render(<Shell>x</Shell>);
      expect(screen.getByText("All titles 24h")).toBeInTheDocument();
      expect(screen.getByText("24h Vol")).toBeInTheDocument();
      expect(screen.getByText("Avg EPI")).toBeInTheDocument();
      expect(screen.getByText("NEAR · Solana")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "demo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "wallet-menu" })).toBeInTheDocument();
    });
  });
});
