"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Settings, X } from "lucide-react";
import { CHAIN, CHAIN_LABEL, FLAGS, MODE, chainUrl, otherModeUrl, type Chain, type Mode } from "@/lib/env";

const MODES: { id: Mode; label: string; detail: string }[] = [
  { id: "live", label: "Live", detail: "Real TMDB data and real on-chain prediction pools on testnet." },
  { id: "demo", label: "Demo", detail: "Fully simulated market with news controls. Nothing here is real." },
];

const CHAINS: Chain[] = ["near", "solana"];

/** Keeps the current path when hopping between deployments, so a judge lands on the same page. */
const withPath = (base: string) =>
  typeof window === "undefined" ? base : `${base}${window.location.pathname}${window.location.search}`;

/** Says which deployment this is, and links to the other mode. Always visible so judges can compare both. */
export function ModeBadge({ className }: { className?: string }) {
  const other = MODE === "demo" ? "live" : "demo";
  return (
    <a
      href={otherModeUrl()}
      onClick={(e) => {
        e.currentTarget.href = withPath(otherModeUrl());
      }}
      title={`You are on the ${MODE} site (${CHAIN_LABEL[CHAIN]}). Open the ${other} site.`}
      className={clsx(
        "cursor-pointer inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2.5 text-[12px] font-medium transition-colors pointer-coarse:h-11",
        MODE === "live" ? "border-up/40 text-up hover:bg-up/10" : "border-line-2 text-muted hover:text-text",
        className,
      )}
    >
      {MODE === "live" ? (
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full border border-current" />
      )}
      {MODE === "live" ? "Live" : "Demo"}
      <span className="text-faint">·</span>
      <span className="text-muted">{other === "live" ? "Go live" : "Try demo"}</span>
    </a>
  );
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (base: string) => window.location.assign(withPath(base));

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="settings-menu"
        aria-label="Settings"
        className={clsx(
          "cursor-pointer grid h-9 w-9 place-items-center rounded transition-colors pointer-coarse:h-11 pointer-coarse:w-11",
          open ? "border border-bg bg-bg text-ink" : "border border-bg/25 text-bg/75 hover:border-bg/60 hover:text-bg",
        )}
      >
        <Settings size={15} />
      </button>

      {open && (
        <div
          id="settings-menu"
          ref={panel}
          tabIndex={-1}
          role="dialog"
          aria-label="Settings"
          className="fixed right-4 top-[60px] z-50 max-h-[calc(100vh-76px)] w-[min(340px,calc(100vw-32px))] overflow-y-auto border-2 border-ink bg-panel p-4 shadow-[0_8px_24px_rgba(20,20,20,0.18)] outline-none"
        >
          <div className="flex items-center gap-2">
            <h2 className="h-panel">Settings</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close settings"
              className="cursor-pointer ml-auto grid h-7 w-7 place-items-center rounded text-muted hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <X size={14} />
            </button>
          </div>

          <h3 className="mt-4 text-xs text-muted">Environment</h3>
          <div className="mt-2 space-y-2">
            {MODES.map((m) => {
              const current = m.id === MODE;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={current}
                  disabled={current}
                  onClick={() => go(otherModeUrl())}
                  className={clsx(
                    "block w-full rounded border p-3 text-left transition-colors",
                    current ? "border-text/40 bg-bg" : "cursor-pointer border-line-2 hover:bg-bg",
                  )}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    {m.label}
                    {current && <span className="text-xs font-normal text-muted">current</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{m.detail}</span>
                </button>
              );
            })}
          </div>

          {FLAGS.chainSwitch && (
            <>
              <h3 className="mt-4 text-xs text-muted">Chain</h3>
              <div role="group" aria-label="Chain" className="seg mt-2 flex w-full [&>button]:flex-1">
                {CHAINS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="cursor-pointer"
                    aria-pressed={c === CHAIN}
                    onClick={() => c !== CHAIN && go(chainUrl(c))}
                  >
                    {CHAIN_LABEL[c]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-snug text-muted">
                Each chain runs on its own site. Switching opens the same page there.
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
