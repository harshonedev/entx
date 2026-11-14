"use client";

// YES-probability history for prediction markets. Every recorded point is real: it is the market's
// price at that moment in this browser, and it survives reloads (localStorage). The 24 hours before the
// first recording are flagged `modelled`: they are derived from the linked title's EPI history with the
// same coupling the simulation uses (oracle news moves YES by sensitivity × 2.2 × relative EPI change),
// never from random noise. With no EPI to model from, the lead-in stays flat.
import { useSyncExternalStore } from "react";
import { PREDICTIONS, type PredictionSeed } from "./predictions";
import { yesPrice } from "./engine";
import { useMarket, type MarketState } from "@/store/market";

export interface ProbPoint {
  time: number; // unix seconds
  value: number; // 0..1
  /** True for the lead-in before recording started, modelled from the title's EPI; not a price anyone saw. */
  modelled?: true;
}

const BACKFILL_POINTS = 96;
const BACKFILL_STEP = 900; // seconds → 24 hours of lead-in at 15-minute steps
/** Same coupling as the store: YES moves by sensitivity × EPI_TO_ODDS × relative EPI change. */
const EPI_TO_ODDS = 2.2;
const MAX_POINTS = 2400;
/**
 * Live points are bucketed to this many seconds. The chart spaces points by index, not time, so one
 * point per tick would stretch a few live minutes across most of the axis and repeat time labels.
 */
const LIVE_STEP = 15;
const STORAGE_KEY = "entx:prob-history:v1";
const SAVE_EVERY_MS = 5_000;

const series = new Map<string, ProbPoint[]>();
const listeners = new Set<() => void>();
let started = false;
let lastSave = 0;

function loadSaved(): Record<string, ProbPoint[]> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProbPoint[]>) : {};
  } catch {
    return {};
  }
}

function save(force = false) {
  const now = Date.now();
  if (!force && now - lastSave < SAVE_EVERY_MS) return;
  lastSave = now;
  try {
    const out: Record<string, ProbPoint[]> = {};
    for (const [id, list] of series) out[id] = list.filter((p) => !p.modelled);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* storage full or blocked: history still works for this session */
  }
}

/** EPI at time `t`, linearly interpolated and clamped to the ends of the recorded index. */
function epiAt(hist: MarketState["epiHistory"], t: number): number {
  if (t <= hist[0].time) return hist[0].value;
  for (let i = 1; i < hist.length; i++) {
    const b = hist[i];
    if (t <= b.time) {
      const a = hist[i - 1];
      return b.time === a.time ? b.value : a.value + ((b.value - a.value) * (t - a.time)) / (b.time - a.time);
    }
  }
  return hist[hist.length - 1].value;
}

/**
 * Lead-in ending one step before `end`, back-filled from the linked title's EPI so it has the shape the
 * index had. Flat at `value` when there is no linked title or the market has already settled.
 */
function leadIn(p: PredictionSeed, value: number, end: number, settled: boolean): ProbPoint[] {
  const hist = p.assetId && !settled ? useMarket.getState().markets[p.assetId]?.epiHistory : undefined;
  const epi0 = hist?.length ? epiAt(hist, end) : 0;
  return Array.from({ length: BACKFILL_POINTS }, (_, i) => {
    const time = end - (BACKFILL_POINTS - i) * BACKFILL_STEP;
    const v =
      hist?.length && epi0 > 0
        ? Math.min(0.98, Math.max(0.02, value + p.sensitivity * EPI_TO_ODDS * ((epiAt(hist, time) - epi0) / epi0)))
        : value;
    return { time, value: v, modelled: true as const };
  });
}

function record() {
  const { predictions } = useMarket.getState();
  const now = Math.floor(Date.now() / 1000 / LIVE_STEP) * LIVE_STEP;
  let changed = false;
  let saved: Record<string, ProbPoint[]> | null = null;
  for (const p of PREDICTIONS) {
    const st = predictions[p.id];
    if (!st) continue;
    const value = st.resolved ? (st.resolved === "YES" ? 1 : 0) : yesPrice(st.pool);
    const list = series.get(p.id);
    if (!list) {
      saved ??= loadSaved();
      const kept = (saved[p.id] ?? []).filter((x) => x.time < now).slice(-MAX_POINTS);
      const first = kept[0] ?? { time: now, value };
      series.set(p.id, [...leadIn(p, first.value, first.time, !!st.resolved), ...kept, { time: now, value }]);
      changed = true;
      continue;
    }
    const last = list[list.length - 1];
    if (now < last.time || (now === last.time && last.value === value)) continue;
    // Snapshots are immutable: build a new array so React and the chart see the change.
    const next = now === last.time ? [...list.slice(0, -1), { time: now, value }] : [...list, { time: now, value }];
    series.set(p.id, next.length > MAX_POINTS + BACKFILL_POINTS ? next.slice(-MAX_POINTS) : next);
    changed = true;
  }
  if (changed) {
    save();
    listeners.forEach((l) => l());
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // Wait for the saved demo state; seeding from the pre-hydration defaults would draw a false jump.
  if (useMarket.persist.hasHydrated()) record();
  else useMarket.persist.onFinishHydration(() => record());
  useMarket.subscribe((s, prev) => {
    if (s.predictions !== prev.predictions && useMarket.persist.hasHydrated()) record();
  });
  window.addEventListener("pagehide", () => save(true));
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Forget all recorded history (used by "Reset demo"). */
export function clearProbHistory() {
  series.clear();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  record();
}

/**
 * Change over recorded points only (never the modelled lead-in), up to the last hour.
 * Returns null until at least a minute has been recorded.
 */
export function recordedChange(list: ProbPoint[]): { pts: number; seconds: number } | null {
  const real = list.filter((p) => !p.modelled);
  if (real.length < 2) return null;
  const last = real[real.length - 1];
  const from = real.find((p) => p.time >= last.time - 3600) ?? real[0];
  const seconds = last.time - from.time;
  if (seconds < 60) return null;
  return { pts: (last.value - from.value) * 100, seconds };
}

const EMPTY: ProbPoint[] = [];

/** Live YES-probability series for one market. Empty during SSR and the first client render. */
export function useProbHistory(id: string): ProbPoint[] {
  return useSyncExternalStore(
    subscribe,
    () => series.get(id) ?? EMPTY,
    () => EMPTY,
  );
}
