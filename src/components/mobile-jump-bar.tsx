"use client";

import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown } from "lucide-react";

/**
 * Mobile bottom bar that jumps to a ticket further down the page. It steps aside while that ticket is
 * on screen, so there is never a second primary button competing with the ticket's own.
 */
export function MobileJumpBar({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [targetVisible, setTargetVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setTargetVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  return (
    <div
      aria-hidden={targetVisible || undefined}
      className={clsx(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur xl:hidden",
        "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
        targetVisible && "pointer-events-none translate-y-full",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The bar's button. It only scrolls to the ticket, so it stays neutral: the ticket's own Buy (green),
 * Sell (red) or Yes/No button is the one colored action, and the bar never promises a different color.
 */
export function JumpLink({ targetId, children }: { targetId: string; children: ReactNode }) {
  return (
    <a
      href={`#${targetId}`}
      className="cursor-pointer inline-flex h-11 shrink-0 items-center gap-1.5 rounded border border-line-2 bg-panel-2 px-4 text-sm font-semibold text-text transition-colors hover:bg-ink/[0.07]"
    >
      {children}
      <ArrowDown size={14} aria-hidden className="text-muted" />
    </a>
  );
}
