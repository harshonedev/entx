"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

/** Light is the newsprint day edition, dark the Night Edition; "system" follows the OS. */
export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export { THEME_KEY } from "./theme-script";

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", cb);
  return () => {
    mo.disconnect();
    window.removeEventListener("storage", cb);
  };
}

/** The resolved theme on <html>; re-renders when it changes (toggle, OS switch, another tab). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light");
}

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // storage blocked: the choice still applies for this page view
  }
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

const prefSubscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("entx-theme-pref", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("entx-theme-pref", cb);
  };
};

/** The stored preference (light / dark / system) plus a setter, for the toggle UIs. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(prefSubscribe, readThemePref, () => "system" as ThemePref);
  return [
    pref,
    (p) => {
      setThemePref(p);
      window.dispatchEvent(new Event("entx-theme-pref"));
    },
  ];
}
