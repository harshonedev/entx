"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ASSETS } from "@/lib/assets";
import { releaseInfo } from "@/lib/release";
import { change24h, useMarket } from "@/store/market";
import { Poster } from "./poster";
import { Change } from "./ui";

const FADE = "48px";

/**
 * The entertainment calendar is the real clock behind these prices: openings, premieres and the
 * weeks after. Titles run left to right from next release to longest-running, so the moments that
 * move a price (opening weekend, premiere week) sit at the front.
 */
export function ReleaseClock() {
  const markets = useMarket((s) => s.markets);
  const items = ASSETS.map((a) => ({ a, r: releaseInfo(a) }))
    .filter(({ r }) => r.days < 120)
    .sort((x, y) => x.r.days - y.r.days);

  const scroller = useRef<HTMLOListElement>(null);
  // Which edges still have titles hidden past them; drives the edge fade and the prev/next buttons.
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  // Edge fade is a mask on the scroller (content fades out), not a painted gradient over the panel.
  const mask = `linear-gradient(to right, ${edges.start ? "transparent" : "#000"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${edges.end ? "transparent" : "#000"})`;

  const navBtn =
    "cursor-pointer grid h-8 w-8 place-items-center rounded border border-line-2 text-muted transition-colors hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:text-muted pointer-coarse:h-11 pointer-coarse:w-11";

  return (
    <section aria-labelledby="release-h" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pt-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="release-h" className="h-panel">Release calendar</h2>
          <span className="text-xs text-muted">Openings and premieres move prices most</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => page(-1)}
            disabled={!edges.start}
            aria-label="Earlier releases"
            aria-controls="release-list"
            className={navBtn}
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => page(1)}
            disabled={!edges.end}
            aria-label="Later releases"
            aria-controls="release-list"
            className={navBtn}
          >
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      </div>
      <ol
        id="release-list"
        ref={scroller}
        onScroll={measure}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="mt-3 flex overflow-x-auto overscroll-x-contain scroll-smooth pb-4 [scrollbar-width:thin] motion-reduce:scroll-auto"
      >
        {items.map(({ a, r }) => {
          const live = r.phase !== "run";
          return (
            <li key={a.id} className="relative w-40 shrink-0 px-4">
              {/* Timeline rail */}
              <div aria-hidden className="absolute left-0 right-0 top-[7px] h-px bg-line" />
              <div
                aria-hidden
                className={clsx(
                  "relative h-[15px] w-[15px] rounded-full border-2 border-panel",
                  r.phase === "upcoming" ? "bg-text" : r.phase === "opening" ? "bg-accent" : "bg-line-2",
                )}
              />
              <div className={clsx("mt-2 text-xs font-medium", live ? "text-text" : "text-muted")}>{r.label}</div>
              <div className="num text-xs text-muted">{r.date}</div>
              {/* Focusing a card scrolls it into view, so Tab walks the whole calendar. Inset ring: the
                  scroller clips anything drawn outside it. */}
              <Link
                href={`/asset/${a.id}`}
                className="cursor-pointer group -mx-2 mt-3 block rounded p-2 hover:bg-white/[0.03] focus-visible:outline-offset-[-2px]"
                aria-label={`${a.title}, ${r.label}`}
              >
                <Poster asset={a} size="lg" className="transition-[border-color] group-hover:border-white/30" />
                <span className="mt-2 block truncate text-[13px] font-medium">{a.title}</span>
                <Change value={change24h(markets[a.id])} className="text-xs" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
