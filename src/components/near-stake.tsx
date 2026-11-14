"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Loader2 } from "lucide-react";
import { useNear } from "@/lib/near";
import {
  nearToYocto,
  nearTxUrl,
  nearView,
  resolvedOutcome,
  yoctoToNear,
  type NearMarket,
  type NearStake,
} from "@/lib/near-config";
import { useMarket } from "@/store/market";

const AMOUNTS = [0.1, 0.5, 1];

/** Real parimutuel staking with testnet NEAR on the ENTX contract. */
export function NearStakePanel({ marketId }: { marketId: string }) {
  const { accountId, call, connect, ready } = useNear();
  const toast = useMarket((s) => s.toast);
  const [m, setM] = useState<NearMarket | null>(null);
  const [stake, setStake] = useState<NearStake | null>(null);
  const [amount, setAmount] = useState(0.1);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [market, st] = await Promise.all([
        nearView<NearMarket | null>("get_market", { market_id: marketId }),
        accountId
          ? nearView<NearStake | null>("get_stake", { market_id: marketId, account_id: accountId })
          : Promise.resolve(null),
      ]);
      setM(market);
      setStake(st);
    } catch {
      /* RPC hiccup: keep last state */
    }
  }, [marketId, accountId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 12_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const run = async (label: string, fn: () => Promise<string>, ok: string) => {
    setBusy(label);
    try {
      const hash = await fn();
      setLastTx(hash);
      toast({ title: ok, body: `NEAR testnet · ${hash.slice(0, 10)}…`, tone: "up", href: hash ? nearTxUrl(hash) : undefined });
      setTimeout(load, 1500);
    } catch (e) {
      toast({ title: "NEAR transaction failed", body: (e instanceof Error ? e.message : String(e)).slice(0, 120), tone: "down" });
    } finally {
      setBusy(null);
    }
  };

  if (!m) {
    return <div className="mt-3 rounded-xl border border-near/20 p-3 text-xs text-faint">Loading on-chain pool…</div>;
  }

  const yes = BigInt(m.yes_pool);
  const no = BigInt(m.no_pool);
  const total = yes + no;
  const yesShare = total > BigInt(0) ? Number((yes * BigInt(1000)) / total) / 10 : 50;
  const outcome = resolvedOutcome(m.status);
  const myYes = stake ? BigInt(stake.yes) : BigInt(0);
  const myNo = stake ? BigInt(stake.no) : BigInt(0);
  const hasStake = myYes + myNo > BigInt(0);

  let claimable = BigInt(0);
  if (outcome !== null && stake && !stake.claimed) {
    const win = outcome ? yes : no;
    const mine = outcome ? myYes : myNo;
    claimable = win === BigInt(0) ? myYes + myNo : (mine * total) / win;
  }

  return (
    <div className="mt-3 rounded border border-line-2 bg-bg p-3">
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-near">
          <span className="h-1.5 w-1.5 rounded-full bg-near" /> On-chain pool · NEAR testnet
        </span>
        <span className="num text-muted">{yoctoToNear(total, 2)} NEAR staked</span>
      </div>
      <div className="mt-2 flex h-1 overflow-hidden bg-down/40">
        <div className="h-full bg-up" style={{ width: `${yesShare}%` }} />
      </div>
      <div className="num mt-1 flex justify-between text-[11px] text-muted">
        <span>YES {yoctoToNear(yes, 2)} Ⓝ</span>
        <span>NO {yoctoToNear(no, 2)} Ⓝ</span>
      </div>

      {outcome !== null ? (
        <div className="mt-2 text-xs">
          <span className={outcome ? "text-up" : "text-down"}>Resolved {outcome ? "YES" : "NO"} on-chain.</span>{" "}
          {claimable > BigInt(0) ? (
            <button
              disabled={!!busy}
              onClick={() =>
                run("claim", () => call("claim", { market_id: marketId }, "0", 50), "Payout claimed")
              }
              className="ml-1 rounded-md bg-near px-2 py-1 font-semibold text-black disabled:opacity-50"
            >
              {busy === "claim" ? "Claiming…" : `Claim ${yoctoToNear(claimable, 3)} NEAR`}
            </button>
          ) : stake?.claimed ? (
            <span className="text-muted">Claimed.</span>
          ) : hasStake ? (
            <span className="text-muted">No payout for this stake.</span>
          ) : null}
        </div>
      ) : !accountId ? (
        <button
          onClick={connect}
          disabled={!ready}
          className="mt-2 w-full rounded-lg border border-near/40 py-1.5 text-xs font-semibold text-near hover:bg-near/10"
        >
          Connect NEAR to stake real testnet NEAR
        </button>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              className={clsx(
                "num rounded-md border px-2 py-1 text-[11px]",
                amount === a ? "border-near text-near" : "border-line text-muted",
              )}
            >
              {a}Ⓝ
            </button>
          ))}
          <div className="ml-auto flex gap-1.5">
            {(["YES", "NO"] as const).map((side) => (
              <button
                key={side}
                disabled={!!busy}
                onClick={() =>
                  run(
                    side,
                    () => call("stake", { market_id: marketId, outcome: side === "YES" }, nearToYocto(amount), 30),
                    `Staked ${amount} NEAR on ${side}`,
                  )
                }
                className={clsx(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-black disabled:opacity-50",
                  side === "YES" ? "bg-up" : "bg-down",
                )}
              >
                {busy === side && <Loader2 size={11} className="animate-spin" />}
                {side}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasStake && (
        <div className="num mt-2 text-[11px] text-muted">
          Your stake: {myYes > BigInt(0) && `${yoctoToNear(myYes)} Ⓝ YES`}
          {myYes > BigInt(0) && myNo > BigInt(0) && " · "}
          {myNo > BigInt(0) && `${yoctoToNear(myNo)} Ⓝ NO`}
        </div>
      )}
      {lastTx && (
        <a
          href={nearTxUrl(lastTx)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-near hover:underline"
        >
          Last tx {lastTx.slice(0, 8)}… <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}
