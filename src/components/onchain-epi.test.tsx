import { render, screen, within } from "@testing-library/react";
import { ASSETS } from "@/lib/assets";
import { PREDICTIONS } from "@/lib/predictions";
import { NEAR_CONTRACT, type NearMarket } from "@/lib/near-config";
import { APP_MARKET_IDS, ContractProofStrip, marketCounts } from "./onchain-epi";

const m = (id: string) => ({ id }) as NearMarket;
const rpc = (v: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: "entx", result: { result: Array.from(new TextEncoder().encode(JSON.stringify(v))) } }));

afterEach(() => vi.unstubAllGlobals());

describe("marketCounts", () => {
  it("lists every catalogue title and prediction", () => {
    expect(APP_MARKET_IDS.size).toBe(ASSETS.length + PREDICTIONS.length);
  });

  it("splits registered markets into listed-in-app and legacy", () => {
    expect(marketCounts({ markets: 5 }, [m(ASSETS[0].id), m(PREDICTIONS[0].id), m("old-1"), m("old-2"), m("old-3")])).toEqual({
      registered: 5,
      listed: 2,
      legacy: 3,
    });
  });
});

describe("ContractProofStrip", () => {
  it("labels the NEAR registry count and the in-app subset from the same reads as /onchain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const method = JSON.parse(String(init.body)).params.method_name;
        if (method === "get_stats") return rpc({ owner: NEAR_CONTRACT, markets: 45, receipts: 0, epi_reports: 23, total_staked: "0" });
        if (method === "get_markets") return rpc([m(ASSETS[0].id), m(ASSETS[1].id), m("legacy")]);
        return rpc([NEAR_CONTRACT, "oracle.testnet"]);
      }),
    );
    render(<ContractProofStrip />);
    const strip = screen.getByRole("region", { name: "Live on NEAR testnet" });
    expect(await within(strip).findByText(/markets registered on NEAR/)).toHaveTextContent(
      "45 markets registered on NEAR (2 listed in app)",
    );
  });

  it("omits the in-app count rather than guessing when get_markets fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const method = JSON.parse(String(init.body)).params.method_name;
        if (method === "get_stats") return rpc({ owner: NEAR_CONTRACT, markets: 45, receipts: 0, epi_reports: 23, total_staked: "0" });
        if (method === "get_markets") return new Response(JSON.stringify({ error: "boom" }));
        return rpc([NEAR_CONTRACT, "oracle.testnet"]);
      }),
    );
    render(<ContractProofStrip />);
    const text = await screen.findByText(/markets registered on NEAR/);
    expect(text).toHaveTextContent("45 markets registered on NEAR");
    expect(text).not.toHaveTextContent(/listed in app/);
  });
});
