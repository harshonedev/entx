/**
 * ENTX brand marks. Geometry traced from the wordmark master (viewBox units, cap height 155).
 * Both render in `currentColor`, so callers pick the colour with a text-* class.
 */

const E = "M0 0H154V21H21V65H154V85H21V133H154V155H0Z";
const N = "M248 0H282L407 131V0H430V155H396L271 24V155H248Z";
const T = "M514 0H674V20H605V155H583V20H514Z";
const X = "M754 0H784L836 57.6L888 0H918L851 74.2L924 155H894L836 90.8L778 155H748L821 74.2Z";

type Props = { className?: string; title?: string };

/** Full "ENTX" wordmark. Width follows height at 924:155. */
export function Wordmark({ className, title = "ENTX" }: Props) {
  return (
    <svg viewBox="0 0 924 155" className={className} fill="currentColor" role="img" aria-label={title}>
      <path d={`${E}${N}${T}${X}`} />
    </svg>
  );
}

/** The "E" alone — used where the wordmark does not fit (collapsed rail, favicon). */
export function LogoMark({ className }: Omit<Props, "title">) {
  return (
    <svg viewBox="0 0 154 155" className={className} fill="currentColor" aria-hidden="true">
      <path d={E} />
    </svg>
  );
}
