import { NextResponse } from "next/server";
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";
import { ASSET_BY_ID } from "@/lib/assets";
import { NEAR_CONTRACT, NEAR_RPC } from "@/lib/near-config";

/**
 * Trusted ENTX oracle. Signs `report_epi` on the NEAR contract with the allow-listed oracle key,
 * so EPI updates triggered in the demo are published on-chain as `trusted: true`.
 *
 * Requires NEAR_ORACLE_ACCOUNT + NEAR_ORACLE_PRIVATE_KEY (testnet). Without them, returns 503 and the
 * app keeps working off-chain.
 */

let last = 0;
const MIN_INTERVAL_MS = 2500;

export async function GET() {
  return NextResponse.json({
    enabled: !!(process.env.NEAR_ORACLE_ACCOUNT && process.env.NEAR_ORACLE_PRIVATE_KEY),
    oracle: process.env.NEAR_ORACLE_ACCOUNT ?? null,
    contract: NEAR_CONTRACT,
  });
}

export async function POST(req: Request) {
  const accountId = process.env.NEAR_ORACLE_ACCOUNT;
  const key = process.env.NEAR_ORACLE_PRIVATE_KEY as KeyPairString | undefined;
  if (!accountId || !key) {
    return NextResponse.json({ error: "Oracle signer not configured" }, { status: 503 });
  }

  let body: { assetId?: string; epi?: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const asset = body.assetId ? ASSET_BY_ID[body.assetId] : undefined;
  const epi = Number(body.epi);
  if (!asset || !Number.isFinite(epi) || epi < 0 || epi > 100) {
    return NextResponse.json({ error: "Unknown asset or EPI out of range" }, { status: 400 });
  }
  const now = Date.now();
  if (now - last < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: "Oracle is rate-limited, try again in a moment" }, { status: 429 });
  }
  last = now;

  try {
    const provider = new JsonRpcProvider({ url: NEAR_RPC });
    const account = new Account(accountId, provider, key);
    const res = await account.callFunctionRaw({
      contractId: NEAR_CONTRACT,
      methodName: "report_epi",
      args: {
        market_id: asset.id,
        epi_x10: Math.round(epi * 10),
        note: String(body.note ?? "").slice(0, 90),
      },
      gas: BigInt(30_000_000_000_000),
    });
    return NextResponse.json({ hash: res.transaction.hash, oracle: accountId });
  } catch (e) {
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) },
      { status: 502 },
    );
  }
}
