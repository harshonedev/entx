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
        "relative shrink-0 overflow-hidden rounded-lg border border-white/10",
        size === "sm" && "h-11 w-8",
        size === "md" && "h-24 w-16",
        size === "lg" && "h-44 w-30",
        className,
      )}
      style={{
        background: `radial-gradient(120% 80% at 30% 15%, ${c1} 0%, transparent 60%), linear-gradient(170deg, ${c1}55 0%, ${c2} 70%)`,
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 3px)",
        }}
      />
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
