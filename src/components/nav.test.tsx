import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS } from "@/lib/assets";
import { useMarket } from "@/store/market";

const nav = vi.hoisted(() => ({ path: "/", push: vi.fn() }));
const wallet = vi.hoisted(() => ({ connected: false, publicKey: null }));
const near = vi.hoisted(() => ({ accountId: null as string | null, ready: true, connect: vi.fn(), disconnect: vi.fn() }));
const airdrop = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => wallet }));
vi.mock("@/lib/near", () => ({ useNear: () => near }));
vi.mock("@/lib/solana", () => ({ useAirdrop: () => airdrop }));
vi.mock("./wallet-menu", () => ({ WalletMenu: () => <button>wallet-menu</button> }));
vi.mock("./demo-controls", () => ({ DemoControls: () => <button>demo</button> }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={props.src} />,
}));

import { Shell } from "./nav";

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
  airdrop.mockReset();
});

const mainNav = () => screen.getAllByRole("navigation", { name: "Main" })[0];
const expandSidebar = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Expand sidebar" }));

describe("Shell", () => {
  it("renders children and the main nav links", () => {
    render(<Shell>page body</Shell>);
    expect(screen.getByText("page body")).toBeInTheDocument();
    const links = within(mainNav()).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/", "/predictions", "/epi", "/portfolio", "/onchain"]);
  });

  it.each([
    ["/", "Discover"],
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

  describe("desktop sidebar collapse", () => {
    it("starts collapsed, hides the account panel, and expands with persistence", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      const toggle = screen.getByRole("button", { name: "Expand sidebar" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("link", { name: /Portfolio value/ })).not.toBeInTheDocument();

      await user.click(toggle);
      expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
      expect(localStorage.getItem("entx:sidebar-collapsed")).toBe("0");
      expect(screen.getByRole("link", { name: /Portfolio value/ })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
      expect(localStorage.getItem("entx:sidebar-collapsed")).toBe("1");
    });

    it("restores the saved expanded preference", () => {
      localStorage.setItem("entx:sidebar-collapsed", "0");
      render(<Shell>x</Shell>);
      expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    });

    it("syncs with other tabs via the storage event", () => {
      render(<Shell>x</Shell>);
      act(() => {
        localStorage.setItem("entx:sidebar-collapsed", "0");
        window.dispatchEvent(new StorageEvent("storage", { key: "entx:sidebar-collapsed" }));
      });
      expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    });

    it("shows a label tooltip on the collapsed rail", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      const link = within(mainNav()).getByRole("link", { name: "EPI" });
      await user.hover(link);
      const tip = document.querySelector(".fixed.left-\\[72px\\]");
      expect(tip).toHaveTextContent("EPI");
      await user.unhover(link);
      expect(document.querySelector(".fixed.left-\\[72px\\]")).toBeNull();
    });
  });

  it("shows portfolio value from the store", async () => {
    const user = userEvent.setup();
    render(<Shell>x</Shell>);
    await expandSidebar(user);
    const card = screen.getByRole("link", { name: /Portfolio value/ });
    expect(card).toHaveAttribute("href", "/portfolio");
    expect(card).toHaveTextContent("+0.00% all time");
    act(() => useMarket.setState({ cash: 1100 }));
    expect(card).toHaveTextContent("+10.00% all time");
  });

  describe("receipt toggles", () => {
    it("are disabled with a hint when no wallet is connected", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await expandSidebar(user);
      const sol = screen.getByRole("button", { name: /Solana devnet/ });
      const nr = screen.getByRole("button", { name: /NEAR testnet/ });
      expect(sol).toBeDisabled();
      expect(nr).toBeDisabled();
      expect(sol).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByText("Connect a Solana or NEAR wallet to turn its receipts on.")).toBeInTheDocument();
    });

    it("toggle chain prefs once the wallet is connected", async () => {
      near.accountId = "alice.testnet";
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await expandSidebar(user);
      const nr = screen.getByRole("button", { name: /NEAR testnet/ });
      expect(nr).toBeEnabled();
      expect(nr).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("Connect a Solana wallet to turn its receipts on.")).toBeInTheDocument();
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
    const search = () => screen.getByRole("combobox", { name: "Search titles" });

    it("lists up to 6 titles on focus and filters by title or ticker", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await user.click(search());
      expect(search()).toHaveAttribute("aria-expanded", "true");
      expect(screen.getAllByRole("option")).toHaveLength(Math.min(6, ASSETS.length));

      const target = ASSETS[3];
      await user.type(search(), target.ticker);
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent(target.title);
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(search()).toHaveAttribute("aria-activedescendant", options[0].id);
    });

    it("shows no list when nothing matches", async () => {
      const user = userEvent.setup();
      render(<Shell>x</Shell>);
      await user.type(search(), "zzzzqqqq-no-match");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
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
      expect(screen.getByText("NEAR testnet · Solana devnet")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "demo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "wallet-menu" })).toBeInTheDocument();
    });
  });
});
