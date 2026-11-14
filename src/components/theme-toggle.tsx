"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme, useThemePref } from "@/lib/theme";

/**
 * Landing-page edition switch: flips between the day and Night editions. Both icons render and CSS shows
 * the one for the current edition, so server HTML and the pre-paint theme never disagree.
 */
export function ThemeToggle() {
  const theme = useTheme();
  const [, setPref] = useThemePref();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-btn"
      onClick={() => setPref(next)}
      aria-label={theme === "dark" ? "Switch to the day edition" : "Switch to the night edition"}
      title={theme === "dark" ? "Day edition" : "Night edition"}
    >
      <Moon className="i-moon" aria-hidden />
      <Sun className="i-sun" aria-hidden />
    </button>
  );
}
