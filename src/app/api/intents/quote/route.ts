import { NextResponse } from "next/server";
import { clientIp, own, readJson } from "@/lib/http";

/**
 * NEAR Intents (1Click API) dry-run quote proxy.
 *
 * `dry: true` returns a real, live mainnet price quote without generating a deposit address — no funds can
 * move. NEAR Intents has no testnet, so ENTX only ever requests dry quotes. If ONECLICK_JWT is set it is
 * forwarded (lower fee); otherwise the public 0.2% fee tier applies.
 */

const ONECLICK = "https://1click.chaindefuser.com/v0";
/** ENTX settles in USDC on NEAR. */
const SETTLEMENT_ASSET = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

// Dry-run placeholders for refund addresses (never used: dry quotes create no deposit address).
const ORIGINS: Record<string, { decimals: number; refund: string }> = {
  "nep141:sol.omft.near": { decimals: 9, refund: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" },
  "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near": {
    decimals: 6,
    refund: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  },
  "nep141:eth.omft.near": { decimals: 18, refund: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near": {
    decimals: 6,
    refund: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  "nep141:arb.omft.near": { decimals: 18, refund: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  "nep141:wrap.near": { decimals: 24, refund: "wrap.near" },
};

// Public, unauthenticated route that spends the operator's 1Click quota: per-IP and global limits.
const PER_IP_MS = 2_000;
const GLOBAL_MS = 200;
const ipHits = new Map<string, number>();
let lastHit = 0;

function admit(req: Request): boolean {
  const now = Date.now();
  const ip = clientIp(req);
  if (now - lastHit < GLOBAL_MS || now - (ipHits.get(ip) ?? 0) < PER_IP_MS) return false;
  lastHit = now;
  ipHits.set(ip, now);
  if (ipHits.size > 5_000) ipHits.clear();
  return true;
}

export async function POST(req: Request) {
  const body = await readJson<{ originAsset?: string; amount?: number; refundTo?: string; recipient?: string }>(req);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const origin = own(ORIGINS, body.originAsset);
  const amount = Number(body.amount);
  if (!origin || !Number.isFinite(amount) || amount <= 0 || amount > 1e7) {
    return NextResponse.json({ error: "Unsupported asset or amount" }, { status: 400 });
  }

  if (!admit(req)) {
    return NextResponse.json({ error: "Too many quote requests, try again shortly" }, { status: 429 });
  }

  const units = BigInt(Math.round(amount * 1e6)) * BigInt(10) ** BigInt(origin.decimals) / BigInt(1e6);
  // Only mainnet NEAR accounts are valid recipients; testnet demo accounts fall back to a placeholder.
  const recipient =
    typeof body.recipient === "string" && body.recipient.length <= 64 && /^[a-z0-9._-]+\.near$/.test(body.recipient)
      ? body.recipient
      : "intents.near";
  const refundTo = typeof body.refundTo === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.refundTo) && body.originAsset?.startsWith("nep141:sol")
    ? body.refundTo
    : origin.refund;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;

  let res: Response;
  try {
  res = await fetch(`${ONECLICK}/quote`, {
    signal: AbortSignal.timeout(8_000),
    method: "POST",
    headers,
    body: JSON.stringify({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: body.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: SETTLEMENT_ASSET,
      amount: units.toString(),
      refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
    cache: "no-store",
  });
  } catch {
    return NextResponse.json({ error: "1Click did not respond in time" }, { status: 504 });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.quote) {
    return NextResponse.json(
      { error: json.message ?? `1Click returned ${res.status}`, correlationId: json.correlationId },
      { status: 502 },
    );
  }
  return NextResponse.json({
    dry: true,
    quote: json.quote,
    recipient,
    timestamp: json.timestamp,
    authenticated: !!process.env.ONECLICK_JWT,
  });
}
