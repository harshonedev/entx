"use client";

// YES-probability history for prediction markets. The persisted store keeps only the current pool,
// so this module backfills a seeded hour per market and then records every tick for the session.
import { useSyncExternalStore } from "react";
import { PREDICTIONS } from "./predictions";
import { gaussian, hashString, mulberry32, yesPrice } from "./engine";
import { useMarket } from "@/store/market";

export interface ProbPoint {
  time: number; // unix seconds
  value: number; // 0..1
}

const BACKFILL_POINTS = 240;
const BACKFILL_STEP = 15; // seconds → one hour of backfill
const MAX_POINTS = 2400;

const series = new Map<string, ProbPoint[]>();
const listeners = new Set<() => void>();
let started = false;

const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));

/** Seeded random walk that ends exactly at the market's current probability. */
function backfill(id: string, current: number, now: number): ProbPoint[] {
  const rnd = mulberry32(hashString(`${id}:history`));
  const values = [current];
  let v = current;
  // Walk backwards so the last point matches the live price with no jump.
  const drift = (rnd() - 0.5) * 0.0012;
  for (let i = 1; i < BACKFILL_POINTS; i++) {
    v = clamp(v - drift + gaussian(rnd) * 0.0045);
    values.push(v);
  }
  values.reverse();
  return values.map((value, i) => ({ time: now - (BACKFILL_POINTS - 1 - i) * BACKFILL_STEP, value }));
}

function record() {
  const { predictions } = useMarket.getState();
  const now = Math.floor(Date.now() / 1000);
  let changed = false;
  for (const p of PREDICTIONS) {
    const st = predictions[p.id];
    if (!st) continue;
    const value = st.resolved ? (st.resolved === "YES" ? 1 : 0) : yesPrice(st.pool);
    const list = series.get(p.id);
    if (!list) {
      series.set(p.id, backfill(p.id, value, now));
      changed = true;
      continue;
    }
    const last = list[list.length - 1];
    if (now < last.time || (now === last.time && last.value === value)) continue;
    // Snapshots are immutable: build a new array so React and the chart see the change.
    const next = now === last.time ? [...list.slice(0, -1), { time: now, value }] : [...list, { time: now, value }];
    series.set(p.id, next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next);
    changed = true;
  }
  if (changed) listeners.forEach((l) => l());
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
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
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
