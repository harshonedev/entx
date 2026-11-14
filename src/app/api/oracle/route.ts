import { NextResponse } from "next/server";
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";
import { ASSET_BY_ID, EPI_WEIGHTS, ORACLE_EVENTS, type EpiParts } from "@/lib/assets";
import { NEAR_CONTRACT, NEAR_RPC, nearView, type NearMarket } from "@/lib/near-config";

/**
 * ENTX trusted oracle service.
 *
 * The browser only names an event from a fixed catalogue (`eventId`). The server reads the market's current
 * on-chain EPI, applies that event's weighted impact itself, and signs `report_epi`. Clients never choose the
 * published value.
 *
 * The signer is a dedicated oracle account using a FUNCTION-CALL-ONLY access key restricted to `report_epi`
 * on the ENTX contract (see scripts/near-deploy.sh). A leaked key cannot resolve markets, move stakes or
 * transfer funds.
 *
 * Access control:
 * - Default: callers must send `Authorization: Bearer $ORACLE_API_SECRET` (for server-side jobs / cron).
 * - `ENTX_PUBLIC_ORACLE=true` (demo mode) lets the in-app oracle buttons publish without a secret. Origin and
 *   client-IP headers are spoofable by non-browser clients, so in that mode the *global* limits below are the
 *   real bound; the per-IP limit is best-effort. Blast radius stays small either way: values come from a fixed
 *   event catalogue, trusted reports live in a fixed-size on-chain ring (bounded storage), and the key's gas
 *   allowance caps total spend.
 *
 * Demo limitation: events are simulated. A production oracle would derive them from box-office, streaming and
 * social data feeds instead of a button.
 */

const PER_IP_MS = 6_000; // best-effort (spoofable headers)
const GLOBAL_MS = 1_500;
const GLOBAL_PER_HOUR = 240;
const hits = new Map<string, number>();
let lastGlobal = 0;
let hourStart = 0;
let hourCount = 0;

function authorized(req: Request): boolean {
  const secret = process.env.ORACLE_API_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return process.env.ENTX_PUBLIC_ORACLE === "true" && sameOrigin(req);
}

function clientIp(req: Request): string {
  // Prefer the platform-set header (Vercel sets x-real-ip); fall back to the first XFF hop.
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

function eventImpact(eventId: string): number | null {
  const ev = ORACLE_EVENTS.find((e) => e.id === eventId);
  if (!ev) return null;
  return (Object.entries(ev.delta) as [keyof EpiParts, number][]).reduce(
    (t, [k, d]) => t + EPI_WEIGHTS[k] * d,
    0,
  );
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({
    enabled: !!(process.env.NEAR_ORACLE_ACCOUNT && process.env.NEAR_ORACLE_PRIVATE_KEY),
    publicDemo: process.env.ENTX_PUBLIC_ORACLE === "true",
    oracle: process.env.NEAR_ORACLE_ACCOUNT ?? null,
    contract: NEAR_CONTRACT,
    events: ORACLE_EVENTS.map((e) => ({ id: e.id, label: e.label, impact: eventImpact(e.id) })),
  });
}

export async function POST(req: Request) {
  const accountId = process.env.NEAR_ORACLE_ACCOUNT;
  const key = process.env.NEAR_ORACLE_PRIVATE_KEY as KeyPairString | undefined;
  if (!accountId || !key) {
    return NextResponse.json({ error: "Oracle signer not configured" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Oracle publishing requires authorization" }, { status: 401 });
  }

  let body: { assetId?: string; eventId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const asset = body.assetId ? ASSET_BY_ID[body.assetId] : undefined;
  const impact = body.eventId ? eventImpact(body.eventId) : null;
  const ev = ORACLE_EVENTS.find((e) => e.id === body.eventId);
  if (!asset || impact === null || !ev) {
    return NextResponse.json({ error: "Unknown asset or event" }, { status: 400 });
  }

  const ip = clientIp(req);
  const now = Date.now();
  if (now - hourStart > 3_600_000) {
    hourStart = now;
    hourCount = 0;
  }
  if (now - (hits.get(ip) ?? 0) < PER_IP_MS || now - lastGlobal < GLOBAL_MS || hourCount >= GLOBAL_PER_HOUR) {
    return NextResponse.json({ error: "Oracle is rate-limited, try again shortly" }, { status: 429 });
  }
  hits.set(ip, now);
  lastGlobal = now;
  hourCount++;
  if (hits.size > 5_000) hits.clear();

  try {
    const market = await nearView<NearMarket | null>("get_market", { market_id: asset.id });
    if (!market) return NextResponse.json({ error: "Market not registered on-chain" }, { status: 404 });
    const current = market.epi_x10 / 10;
    const next = Math.round(Math.min(100, Math.max(1, current + impact)) * 10) / 10;

    const provider = new JsonRpcProvider({ url: NEAR_RPC });
    const account = new Account(accountId, provider, key);
    const res = await account.callFunctionRaw({
      contractId: NEAR_CONTRACT,
      methodName: "report_epi",
      args: { market_id: asset.id, epi_x10: Math.round(next * 10), note: ev.label },
      gas: BigInt(30_000_000_000_000),
    });
    return NextResponse.json({ hash: res.transaction.hash, oracle: accountId, from: current, epi: next });
  } catch (e) {
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) },
      { status: 502 },
    );
  }
}
