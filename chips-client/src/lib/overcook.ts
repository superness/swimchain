/**
 * Which fryer is overcooking — client-only state, never persisted and never
 * sent to the chain (the fold knows only that the jar was bought).
 *
 * ONE AT A TIME by design: the interesting question is *which* fryer you are
 * willing to burn, and a rack of four lit fryers has no question in it. A
 * later chained rung lifts the limit; a hotter burn never should, since the
 * burn is already a straight loss (see cooking.ts's OVERCOOK note).
 */
import { MAX_CRACKLES } from './cooking';

/** Tap a fryer's flame: light it, move it, or put it out. */
export function toggleOvercook(lit: number | null, index: number): number | null {
  return lit === index ? null : index;
}

/**
 * The flame goes out on its own when there is nothing left to hurry — the
 * chip is golden, or the rack shrank out from under it. Called every tick,
 * so it must be cheap and total.
 */
export function overcookOff(lit: number | null, chips: { crackles: number }[]): number | null {
  if (lit === null) return null;
  const chip = chips[lit];
  if (!chip) return null;
  return chip.crackles >= MAX_CRACKLES ? null : lit;
}
