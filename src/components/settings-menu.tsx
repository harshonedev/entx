"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Settings, X } from "lucide-react";
import { useThemePref, type ThemePref } from "@/lib/theme";
import { CHAIN, CHAIN_LABEL, FLAGS, MODE, chainUrl, otherModeUrl, type Chain, type Mode } from "@/lib/env";

const MODES: { id: Mode; label: string; detail: string }[] = [
  { id: "live", label: "Live", detail: "Real TMDB data and real on-chain prediction pools on testnet." },
  { id: "demo", label: "Demo", detail: "Fully simulated market with news controls. Nothing here is real." },
];

const CHAINS: Chain[] = ["near", "solana"];

const THEMES: { id: ThemePref; label: string }[] = [
  { id: "light", label: "Day" },
  { id: "dark", label: "Night" },
  { id: "system", label: "System" },
];

/** Keeps the current path when hopping between deployments, so a judge lands on the same page. */
const withPath = (base: string) =>
  typeof window === "undefined" ? base : `${base}${window.location.pathname}${window.location.search}`;

/** Says which deployment this is, and links to the other mode. Always visible so judges can compare both. */
export function ModeBadge({ cell = false, className }: { cell?: boolean; className?: string }) {
  const other = MODE === "demo" ? "live" : "demo";
  return (
    <a
      href={otherModeUrl()}
      onClick={(e) => {
        e.currentTarget.href = withPath(otherModeUrl());
      }}
      title={`You are on the ${MODE} site (${CHAIN_LABEL[CHAIN]}). Open the ${other} site.`}
      className={clsx(
        "cursor-pointer inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium transition-colors",
        // In the dateline it is one more hairline cell; standalone it is a bordered chip.
        cell ? "h-full border-r border-line pr-4" : "h-9 border px-2.5 pointer-coarse:h-11",
        MODE === "live"
          ? clsx("text-up", !cell && "border-up/40 hover:bg-up/10")
          : clsx("text-text hover:text-accent", !cell && "border-line-2"),
        className,
      )}
    >
      {MODE === "live" ? "Live" : "Demo"}
      <span className="text-faint">·</span>
      <span className="text-muted">{other === "live" ? "Go live" : "Try demo"}</span>
    </a>
  );
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useThemePref();

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
          open ? "border border-bar-ink bg-bar-ink text-bar" : "border border-bar-ink/25 text-bar-ink/75 hover:border-bar-ink/60 hover:text-bar-ink",
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
          className="fixed right-4 top-[60px] z-50 max-h-[calc(100vh-76px)] w-[min(340px,calc(100vw-32px))] overflow-y-auto border-2 border-ink bg-panel p-4 shadow-lift outline-none"
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

          <h3 className="mt-4 text-xs text-muted">Edition</h3>
          <div role="group" aria-label="Edition" className="seg mt-2 flex w-full [&>button]:flex-1">
            {THEMES.map((t) => (
              <button key={t.id} type="button" className="cursor-pointer" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
                {t.label}
              </button>
            ))}
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
