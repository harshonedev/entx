import clsx from "clsx";
import type { AssetSeed } from "@/lib/assets";

/** Generated key-art tile, so the demo needs no external poster images. */
export function Poster({
  asset,
  className,
  size = "md",
}: {
  asset: AssetSeed;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [c1, c2] = asset.colors;
  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden rounded-sm border border-white/10",
        size === "sm" && "h-11 w-8",
        size === "md" && "h-24 w-16",
        size === "lg" && "h-44 w-30",
        className,
      )}
      style={{ background: c2 }}
      aria-hidden
    >
      <div className="absolute inset-x-0 top-0 h-[58%]" style={{ background: c1, opacity: 0.85 }} />
      <div className="absolute inset-x-0 top-[58%] h-px bg-black/30" />
      {size !== "sm" && (
        <div className="absolute inset-x-0 bottom-0 p-1.5">
          <div
            className={clsx(
              "font-semibold leading-[1.05] tracking-tight text-white/95 [text-wrap:balance]",
              size === "lg" ? "text-sm" : "text-[9px]",
            )}
          >
            {asset.title}
          </div>
          {size === "lg" && (
            <div className="mt-1 text-[10px] text-white/60">{asset.studio}</div>
          )}
        </div>
      )}
    </div>
  );
}
