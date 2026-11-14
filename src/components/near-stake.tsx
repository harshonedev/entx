"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useNear } from "@/lib/near";
import {
  NEAR_CONTRACT,
  NEAR_NETWORK,
  nearAccountUrl,
  nearToYocto,
  nearTxUrl,
  nearView,
  resolvedOutcome,
  stakingClosed,
  yoctoToNear,
  type NearMarket,
  type NearStake,
} from "@/lib/near-config";
import { useMarket } from "@/store/market";

const AMOUNTS = [0.1, 0.5, 1];
const STAKE_GAS_TGAS = 30;

/** Real parimutuel staking with testnet NEAR on the ENTX contract. */
export function NearStakePanel({ marketId }: { marketId: string }) {
  const { accountId, call, connect, ready } = useNear();
  const toast = useMarket((s) => s.toast);
  const [m, setM] = useState<NearMarket | null>(null);
  const [stake, setStake] = useState<NearStake | null>(null);
  const [amount, setAmount] = useState(0.1);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  // Picking a side opens a preview of the exact call; nothing is sent to the wallet until "Sign".
  const [pending, setPending] = useState<"YES" | "NO" | null>(null);

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
      setPending(null);
      toast({ title: ok, body: `NEAR testnet · ${hash.slice(0, 10)}…`, tone: "up", href: hash ? nearTxUrl(hash) : undefined });
      setTimeout(load, 1500);
    } catch (e) {
      toast({ title: "NEAR transaction failed", body: (e instanceof Error ? e.message : String(e)).slice(0, 120), tone: "down" });
    } finally {
      setBusy(null);
    }
  };

  if (!m) {
    return <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted" role="status"><Loader2 size={12} className="animate-spin" /> Reading the NEAR pool…</div>;
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
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-near">
          <span className="h-1.5 w-1.5 rounded-full bg-near" /> On-chain pool · NEAR testnet
        </span>
        <span className="num text-muted">{yoctoToNear(total, 2)} NEAR staked</span>
      </div>
      <div className="mt-2 flex h-1 overflow-hidden bg-down/40">
        <div className="h-full bg-up" style={{ width: `${yesShare}%` }} />
      </div>
      <div className="num mt-1 flex justify-between text-xs text-muted">
        <span>YES {yoctoToNear(yes, 2)} Ⓝ</span>
        <span>NO {yoctoToNear(no, 2)} Ⓝ</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-faint">
        Pool: all stakes on this market. When it settles, the winning side splits the whole pool in proportion to
        each stake. Separate from the simulated odds above.
      </p>

      {outcome !== null ? (
        <div className="mt-2 text-xs">
          <span className={outcome ? "text-up" : "text-down"}>Resolved {outcome ? "YES" : "NO"} on-chain.</span>{" "}
          {claimable > BigInt(0) ? (
            <button
              disabled={!!busy}
              onClick={() =>
                run("claim", () => call("claim", { market_id: marketId }, "0", 50), "Payout claimed")
              }
              className="cursor-pointer ml-1 rounded bg-near px-2 py-1 font-semibold text-black disabled:opacity-50"
            >
              {busy === "claim" ? "Claiming…" : `Claim ${yoctoToNear(claimable, 3)} NEAR`}
            </button>
          ) : stake?.claimed ? (
            <span className="text-muted">Claimed.</span>
          ) : hasStake ? (
            <span className="text-muted">No payout for this stake.</span>
          ) : null}
        </div>
      ) : stakingClosed(m) ? (
        <div className="mt-2 text-xs text-muted">Staking closed. Awaiting on-chain resolution.</div>
      ) : !accountId ? (
        <button
          onClick={connect}
          disabled={!ready}
          className="cursor-pointer mt-2 h-9 w-full rounded border border-near/40 py-1.5 text-xs font-semibold text-near hover:bg-near/10 pointer-coarse:h-11"
        >
          Connect a NEAR wallet to stake (testnet, no real value)
        </button>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-1.5">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                disabled={!!busy}
                onClick={() => setAmount(a)}
                aria-pressed={amount === a}
                className={clsx(
                  "cursor-pointer num min-h-9 rounded border px-2 py-1 text-xs disabled:cursor-not-allowed pointer-coarse:min-h-11",
                  amount === a ? "border-near text-near" : "border-line text-muted hover:text-text",
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
                  onClick={() => setPending(side)}
                  aria-pressed={pending === side}
                  className={clsx(
                    "cursor-pointer min-h-9 rounded px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
                    pending === side
                      ? side === "YES"
                        ? "bg-up text-black"
                        : "bg-down text-black"
                      : side === "YES"
                        ? "bg-up/[0.12] text-up hover:bg-up/[0.2]"
                        : "bg-down/[0.12] text-down hover:bg-down/[0.2]",
                  )}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>
          {pending && (
            <StakePreview
              marketId={marketId}
              side={pending}
              amount={amount}
              sidePool={pending === "YES" ? yes : no}
              total={total}
              busy={busy === pending}
              onSign={() =>
                run(
                  pending,
                  () =>
                    call("stake", { market_id: marketId, outcome: pending === "YES" }, nearToYocto(amount), STAKE_GAS_TGAS),
                  `Staked ${amount} NEAR on ${pending}`,
                )
              }
              onCancel={() => setPending(null)}
            />
          )}
        </>
      )}

      {hasStake && (
        <div className="num mt-2 text-xs text-muted">
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
          className="cursor-pointer mt-1 inline-flex items-center gap-1 text-xs text-near hover:underline"
        >
          Last tx {lastTx.slice(0, 8)}… <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

/** What the wallet will be asked to sign, in plain terms, so it can be checked against the wallet prompt. */
function StakePreview({
  marketId,
  side,
  amount,
  sidePool,
  total,
  busy,
  onSign,
  onCancel,
}: {
  marketId: string;
  side: "YES" | "NO";
  amount: number;
  sidePool: bigint;
  total: bigint;
  busy: boolean;
  onSign: () => void;
  onCancel: () => void;
}) {
  const stake = BigInt(nearToYocto(amount));
  // Parimutuel estimate if nobody else stakes before settlement: your share of the winning side × whole pool.
  const payout = (stake * (total + stake)) / (sidePool + stake);
  return (
    <section
      aria-label="Review before signing"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="mt-2 rounded border border-near/30 bg-panel-2 p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-text">Your wallet will ask you to sign</h3>
        <button
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancel and close preview"
          className="cursor-pointer -m-1 inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:text-text disabled:cursor-not-allowed"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-muted">Network</dt>
        <dd className="text-right">NEAR {NEAR_NETWORK} (no real value)</dd>
        <dt className="text-muted">Contract</dt>
        <dd className="truncate text-right">
          <a
            href={nearAccountUrl(NEAR_CONTRACT)}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer font-mono text-near hover:underline"
          >
            {NEAR_CONTRACT}
          </a>
        </dd>
        <dt className="text-muted">Method</dt>
        <dd className="text-right font-mono">stake</dd>
        <dt className="text-muted">Market id</dt>
        <dd className="truncate text-right font-mono" title={marketId}>
          {marketId}
        </dd>
        <dt className="text-muted">Side</dt>
        <dd className={clsx("text-right font-semibold", side === "YES" ? "text-up" : "text-down")}>
          {side} <span className="font-mono font-normal text-faint">(outcome: {String(side === "YES")})</span>
        </dd>
        <dt className="text-muted">Deposit</dt>
        <dd className="num text-right font-semibold">{amount} NEAR</dd>
        <dt className="text-muted">Gas limit</dt>
        <dd className="num text-right">{STAKE_GAS_TGAS} Tgas</dd>
        <dt className="text-muted">Payout if {side} wins</dt>
        <dd className="num text-right">≈ {yoctoToNear(payout, 3)} NEAR</dd>
      </dl>
      <p className="mt-2 leading-relaxed text-faint">
        Estimate assumes the pool stays as it is now; later stakes change it. The deposit leaves your wallet when
        you sign.
      </p>
      <button
        onClick={onSign}
        disabled={busy}
        className={clsx(
          "cursor-pointer mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60",
          side === "YES" ? "bg-up" : "bg-down",
        )}
      >
        {busy && <Loader2 size={13} className="animate-spin" aria-hidden />}
        {busy ? "Waiting for wallet…" : `Sign & stake ${amount} NEAR on ${side}`}
      </button>
    </section>
  );
}
