/** The amount a ticket offers before the visitor picks one: the preferred amount if cash covers it. */
export const PREFERRED_AMOUNT = 25;

/**
 * Default order amount for a fresh ticket, so the primary action never opens disabled.
 * - With `presets` (bet sheet): the preferred amount, else the largest preset cash covers, else the smallest preset.
 * - Without (trade ticket, free entry): the preferred amount, else the whole dollars cash covers, else 0.
 */
export function defaultAmount(cash: number, presets?: readonly number[], preferred = PREFERRED_AMOUNT): number {
  if (cash >= preferred) return preferred;
  if (presets?.length) return presets.filter((a) => a <= cash).pop() ?? presets[0];
  return cash >= 1 ? Math.floor(cash) : 0;
}
