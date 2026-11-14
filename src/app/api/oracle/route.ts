import { clientIp, own, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";
import { ASSET_BY_ID, EPI_WEIGHTS, ORACLE_EVENTS, computeEpi, type AssetSeed, type EpiParts } from "@/lib/assets";
import { NEAR_CONTRACT, NEAR_RPC, nearView, type NearMarket } from "@/lib/near-config";

/**
 * ENTX trusted oracle service.
 *
 * The browser only names an event from a fixed catalogue (`eventId`). The server computes an ABSOLUTE EPI and
 * signs `report_epi`. Clients never choose the published value.
 *
 * Published value (non-cumulative, see `absoluteEpi`): start from the title's TMDB-seeded EPI parts, apply this
 * one event's part deltas (each part clamped to [1, 100], same as the app), recompute the weighted EPI, then
 * clamp to baseline ± MAX_DEVIATION and to [1, 100]. The current on-chain value is read only to confirm the market
 * exists and to report `from`; it never feeds the new value. So the on-chain EPI always sits within one event of
 * the title's real-data baseline, however many visitors click, instead of drifting toward the 100 cap.
 *
 * The signer is a dedicated oracle account using a FUNCTION-CALL-ONLY access key restricted to `report_epi`
 * on the ENTX contract (see scripts/near-deploy.sh). A leaked key cannot resolve markets, move stakes or
 * transfer funds.
 *
 * Access control:
 * - Default: callers must send `Authorization: Bearer $ORACLE_API_SECRET` (for server-side jobs / cron).
 * - `ENTX_PUBLIC_ORACLE=true` (demo mode) lets the in-app news buttons publish without a secret. Origin and
 *   client-IP headers are spoofable by non-browser clients, so in that mode the *global* limits below are the
 *   real bound; the per-IP limit applies only behind a trusted proxy. Each title also accepts at most one demo
 *   publish per DEMO_PER_TITLE_MS, so one market can't be hammered. Authenticated callers use a separate
 *   bucket, so demo spam can never starve them. Blast radius stays small either way: values come from a fixed
 *   event catalogue, trusted reports live in a fixed-size on-chain ring (bounded storage), and the key's gas
 *   allowance caps total spend.
 *
 * Demo limitation: events are simulated. A production oracle would derive them from box-office, streaming and
 * social data feeds instead of a button.
 */

// Public demo bucket (unauthenticated). Spam here can never starve authenticated publishers.
const DEMO_PER_IP_MS = 6_000; // only meaningful behind a trusted proxy
const DEMO_GLOBAL_MS = 1_500;
const DEMO_PER_HOUR = 240;
const DEMO_PER_TITLE_MS = 60_000;
// Authenticated bucket (bearer secret): separate, generous, still bounded against runaway jobs.
const AUTH_MIN_MS = 250;

const demoHits = new Map<string, number>();
const demoTitleHits = new Map<string, number>();
let demoLast = 0;
let demoHourStart = 0;
let demoHourCount = 0;
let authLast = 0;

type Caller = "auth" | "demo" | null;

function caller(req: Request): Caller {
  const secret = process.env.ORACLE_API_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return "auth";
  if (process.env.ENTX_PUBLIC_ORACLE === "true" && sameOrigin(req)) return "demo";
  return null;
}


/** Admits the request into its caller's bucket, or returns false when rate-limited. */
function admit(kind: "auth" | "demo", req: Request, assetId: string): boolean {
  const now = Date.now();
  if (kind === "auth") {
    if (now - authLast < AUTH_MIN_MS) return false;
    authLast = now;
    return true;
  }
  if (now - demoHourStart > 3_600_000) {
    demoHourStart = now;
    demoHourCount = 0;
  }
  const ip = clientIp(req);
  if (
    now - (demoHits.get(ip) ?? 0) < DEMO_PER_IP_MS ||
    now - (demoTitleHits.get(assetId) ?? 0) < DEMO_PER_TITLE_MS ||
    now - demoLast < DEMO_GLOBAL_MS ||
    demoHourCount >= DEMO_PER_HOUR
  ) {
    return false;
  }
  demoHits.set(ip, now);
  if (demoHits.size > 5_000) demoHits.clear();
  demoTitleHits.set(assetId, now); // bounded by the fixed catalogue
  demoLast = now;
  demoHourCount++;
  return true;
}

function eventImpact(eventId: string): number | null {
  const ev = ORACLE_EVENTS.find((e) => e.id === eventId);
  if (!ev) return null;
  return (Object.entries(ev.delta) as [keyof EpiParts, number][]).reduce(
    (t, [k, d]) => t + EPI_WEIGHTS[k] * d,
    0,
  );
}

/** Largest distance the published EPI may sit from the title's seeded baseline. */
const MAX_DEVIATION = 15;

/**
 * Non-cumulative EPI for `asset` after one catalogue event: baseline parts + the event's deltas (parts clamped to
 * [1, 100]), weighted by EPI_WEIGHTS, then held within baseline ± MAX_DEVIATION and [1, 100].
 */
function absoluteEpi(asset: AssetSeed, eventId: string): { baseline: number; epi: number } | null {
  const ev = ORACLE_EVENTS.find((e) => e.id === eventId);
  if (!ev) return null;
  const baseline = computeEpi(asset.epiParts);
  const parts = { ...asset.epiParts };
  for (const [k, d] of Object.entries(ev.delta) as [keyof EpiParts, number][]) {
    parts[k] = Math.max(1, Math.min(100, parts[k] + d));
  }
  const raw = computeEpi(parts);
  const bounded = Math.min(baseline + MAX_DEVIATION, Math.max(baseline - MAX_DEVIATION, raw));
  return { baseline, epi: Math.round(Math.min(100, Math.max(1, bounded)) * 10) / 10 };
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
  const kind = caller(req);
  if (!kind) {
    return NextResponse.json({ error: "Oracle publishing requires authorization" }, { status: 401 });
  }

  const body = await readJson<{ assetId?: string; eventId?: string }>(req);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const asset = own(ASSET_BY_ID, body.assetId);
  const ev = ORACLE_EVENTS.find((e) => e.id === body.eventId);
  const value = asset && ev ? absoluteEpi(asset, ev.id) : null;
  if (!asset || !ev || !value) {
    return NextResponse.json({ error: "Unknown asset or event" }, { status: 400 });
  }

  if (!admit(kind, req, asset.id)) {
    return NextResponse.json({ error: "Oracle is rate-limited, try again shortly" }, { status: 429 });
  }

  try {
    const market = await nearView<NearMarket | null>("get_market", { market_id: asset.id });
    if (!market) return NextResponse.json({ error: "Market not registered on-chain" }, { status: 404 });
    const current = market.epi_x10 / 10;
    const next = value.epi;

    const provider = new JsonRpcProvider({ url: NEAR_RPC });
    const account = new Account(accountId, provider, key);
    const res = await account.callFunctionRaw({
      contractId: NEAR_CONTRACT,
      methodName: "report_epi",
      args: { market_id: asset.id, epi_x10: Math.round(next * 10), note: ev.label },
      gas: BigInt(30_000_000_000_000),
    });
    return NextResponse.json({
      hash: res.transaction.hash,
      oracle: accountId,
      from: current,
      epi: next,
      baseline: value.baseline,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) },
      { status: 502 },
    );
  }
}
