import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useMarket } from "@/store/market";

const wa = vi.hoisted(() => ({ connection: vi.fn(), wallet: vi.fn() }));

vi.mock("@solana/wallet-adapter-react", () => ({
  ConnectionProvider: (props: { endpoint: string; children: ReactNode }) => {
    wa.connection(props.endpoint);
    return <div data-testid="conn">{props.children}</div>;
  },
  WalletProvider: (props: { wallets: unknown[]; autoConnect: boolean; children: ReactNode }) => {
    wa.wallet(props);
    return <>{props.children}</>;
  },
}));
vi.mock("@solana/wallet-adapter-react-ui", () => ({ WalletModalProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@solana/wallet-adapter-react-ui/styles.css", () => ({}));
vi.mock("@solana/web3.js", () => ({ clusterApiUrl: (c: string) => `https://api.${c}.solana.test` }));
vi.mock("@/lib/near", () => ({ NearProvider: ({ children }: { children: ReactNode }) => <div data-testid="near">{children}</div> }));

import { Providers } from "./providers";

const initial = useMarket.getState();
let rehydrate: ReturnType<typeof vi.spyOn>;
let tick: ReturnType<typeof vi.fn<() => void>>;
let ensureHistory: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  tick = vi.fn<() => void>();
  ensureHistory = vi.fn<() => void>();
  useMarket.setState({ ...initial, tick, ensureHistory }, true);
  rehydrate = vi.spyOn(useMarket.persist, "rehydrate").mockResolvedValue(undefined);
  wa.connection.mockReset();
  wa.wallet.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Providers", () => {
  it("wraps children in Solana + NEAR providers with a devnet endpoint", () => {
    render(
      <Providers>
        <span>child</span>
      </Providers>,
    );
    expect(screen.getByTestId("near")).toHaveTextContent("child");
    expect(wa.connection).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.test",
    );
    expect(wa.wallet).toHaveBeenCalledWith(expect.objectContaining({ wallets: [], autoConnect: true }));
  });

  it("rehydrates persisted state, seeds history, then ticks every 1.5s", async () => {
    render(<Providers>x</Providers>);
    expect(rehydrate).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(ensureHistory).toHaveBeenCalledTimes(1);
    expect(tick).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1500));
    expect(tick).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(4500));
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it("stops ticking on unmount", async () => {
    const { unmount } = render(<Providers>x</Providers>);
    await act(async () => {});
    unmount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(tick).not.toHaveBeenCalled();
  });

  it("does not start ticking if unmounted before rehydration finishes", async () => {
    let done!: () => void;
    rehydrate.mockReturnValue(new Promise<void>((r) => (done = r)));
    const { unmount } = render(<Providers>x</Providers>);
    unmount();
    await act(async () => done());
    act(() => vi.advanceTimersByTime(10_000));
    expect(ensureHistory).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
  });
});
