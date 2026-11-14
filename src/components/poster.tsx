import clsx from "clsx";
import Image from "next/image";
import type { AssetSeed } from "@/lib/assets";

/** TMDB poster when available; otherwise a generated key-art tile. */
export function Poster({
  asset,
  className,
  size = "md",
}: {
  asset: AssetSeed;
  className?: string;
  /** "responsive": sm on phones, md from 640px (one image instead of two swapped by breakpoint). */
  size?: "sm" | "md" | "lg" | "responsive";
}) {
  const [c1, c2] = asset.colors;
  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden rounded-sm border border-ink/15",
        size === "sm" && "h-11 w-8",
        size === "md" && "h-24 w-16",
        size === "responsive" && "h-11 w-8 sm:h-24 sm:w-16",
        size === "lg" && "h-44 w-30",
        className,
      )}
      style={{ background: c2 }}
      aria-hidden
    >
      {asset.posterUrl ? (
        <Image
          src={asset.posterUrl}
          alt=""
          fill
          sizes={size === "lg" ? "120px" : size === "md" ? "64px" : size === "responsive" ? "(min-width: 640px) 64px, 32px" : "32px"}
          className="object-cover"
        />
      ) : (
        <>
      <div className="absolute inset-x-0 top-0 h-[58%]" style={{ background: c1, opacity: 0.85 }} />
      <div className="absolute inset-x-0 top-[58%] h-px bg-black/30" />
      {size !== "sm" && (
        <div className={clsx("absolute inset-x-0 bottom-0 p-1.5", size === "responsive" && "hidden sm:block")}>
          <div
            className={clsx(
              "font-semibold leading-[1.05] tracking-tight text-white/95 [text-wrap:balance]",
              size === "lg" ? "text-sm" : "text-xs",
            )}
          >
            {asset.title}
          </div>
          {size === "lg" && (
            <div className="mt-1 text-xs text-white/70">{asset.studio}</div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
