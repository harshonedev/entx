// Shared (client + server) NEAR configuration.

export const NEAR_NETWORK = "testnet" as const;
export const NEAR_CONTRACT = process.env.NEXT_PUBLIC_NEAR_CONTRACT ?? "entx-market-1794654167.testnet";
export const NEAR_RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://rpc.testnet.fastnear.com";

export const nearTxUrl = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const nearAccountUrl = (acc: string) => `https://testnet.nearblocks.io/address/${acc}`;

export const YOCTO = BigInt("1000000000000000000000000");

export function nearToYocto(near: number): string {
  // 4 decimal places of precision is plenty for demo stakes
  return ((BigInt(Math.round(near * 10_000)) * YOCTO) / BigInt(10_000)).toString();
}

export function yoctoToNear(yocto: string | bigint, digits = 3): string {
  const v = typeof yocto === "bigint" ? yocto : BigInt(yocto || "0");
  const scaled = (v * BigInt(10 ** digits)) / YOCTO;
  return (Number(scaled) / 10 ** digits).toFixed(digits);
}

/** Read-only contract call through JSON-RPC. */
export async function nearView<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "entx",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: NEAR_CONTRACT,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error || json.result?.error) throw new Error(JSON.stringify(json.error ?? json.result.error));
  const bytes = new Uint8Array(json.result.result as number[]);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

// ---- contract types (mirror contracts/near/src/lib.rs) ----

export type MarketStatus = "Open" | { Resolved: { outcome: boolean } };

export interface NearMarket {
  id: string;
  kind: "Asset" | "Prediction";
  title: string;
  ticker: string;
  epi_x10: number;
  status: MarketStatus;
  created_at_ms: number;
  trades: number;
  volume_micro_usd: number;
  oracle_updates: number;
  yes_pool: string;
  no_pool: string;
  /** Staking deadline (prediction markets). Absent on contracts deployed before deadlines existed. */
  closes_at_ms?: number | null;
}

export interface NearReceipt {
  id: number;
  account: string;
  market_id: string;
  side: string;
  qty_micro: number;
  price_micro: number;
  ts_ms: number;
  chain_ref: string | null;
}

export interface NearEpiReport {
  market_id: string;
  reporter: string;
  trusted: boolean;
  epi_x10: number;
  note: string;
  ts_ms: number;
}

export interface NearStake {
  yes: string;
  no: string;
  claimed: boolean;
}

export interface NearStats {
  owner: string;
  markets: number;
  receipts: number;
  epi_reports: number;
  total_staked: string;
}

/** True once the market's staking deadline has passed. */
export const stakingClosed = (m: Pick<NearMarket, "closes_at_ms">, nowMs = Date.now()): boolean =>
  m.closes_at_ms != null && nowMs >= m.closes_at_ms;

export const resolvedOutcome = (s: MarketStatus): boolean | null =>
  typeof s === "object" && "Resolved" in s ? s.Resolved.outcome : null;
